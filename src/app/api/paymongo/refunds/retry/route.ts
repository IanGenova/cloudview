import { NextResponse } from 'next/server';
import {
  GuestPayMongoFlow,
  GuestPayMongoRefundStatus,
  GuestPayMongoStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import { expirePayMongoCheckoutSession } from '@/lib/paymongo';
import {
  requestAutomaticGuestRefund,
  retryGuestPayMongoRefund,
} from '@/lib/guest-paymongo-refund';
import {
  cleanupStagedGuestServiceAttachments,
  type StagedServiceAttachment,
} from '@/lib/guest-service-order';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MANUAL_REFUND_REQUIRED_PREFIX = 'MANUAL REFUND REQUIRED:';

function isAuthorized(request: Request) {
  const secret =
    process.env.PAYMONGO_REFUND_CRON_SECRET?.trim() ||
    process.env.SCHEDULED_RELEASE_CRON_SECRET?.trim();

  if (!secret) return false;

  const authorization = request.headers.get('authorization');
  const cronSecret = request.headers.get('x-cron-secret');

  return authorization === `Bearer ${secret}` || cronSecret === secret;
}

async function run(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized.' },
      { status: 401 }
    );
  }

  const expiredCheckoutCandidates = await db.guestPayMongoSession.findMany({
    where: {
      status: GuestPayMongoStatus.PENDING,
      expiresAt: { lte: new Date() },
    },
    select: {
      id: true,
      checkoutSessionId: true,
      flowType: true,
      payload: true,
    },
    orderBy: { expiresAt: 'asc' },
    take: 50,
  });

  const expiredCheckoutResults = [];

  for (const session of expiredCheckoutCandidates) {
    const expired = await db.guestPayMongoSession.updateMany({
      where: {
        id: session.id,
        status: GuestPayMongoStatus.PENDING,
      },
      data: {
        status: GuestPayMongoStatus.EXPIRED,
        checkoutExpiredAt: new Date(),
        errorMessage: 'The guest PayMongo checkout expired before payment.',
      },
    });

    if (expired.count !== 1) continue;

    let remoteExpired = false;
    let remoteError: string | null = null;

    if (session.flowType === GuestPayMongoFlow.SERVICE_REQUEST) {
      const payload =
        session.payload &&
        typeof session.payload === 'object' &&
        !Array.isArray(session.payload)
          ? (session.payload as {
              stagedAttachments?: StagedServiceAttachment[];
            })
          : null;

      if (Array.isArray(payload?.stagedAttachments)) {
        await cleanupStagedGuestServiceAttachments(
          payload.stagedAttachments
        ).catch(() => undefined);
      }
    }

    if (session.checkoutSessionId) {
      try {
        await expirePayMongoCheckoutSession(session.checkoutSessionId);
        remoteExpired = true;
      } catch (error) {
        remoteError =
          error instanceof Error
            ? error.message
            : 'Unable to expire the PayMongo checkout session.';

        console.warn(
          '[Guest PayMongo maintenance] Checkout expiration failed.',
          {
            sessionId: session.id,
            checkoutSessionId: session.checkoutSessionId,
            error: remoteError,
          }
        );
      }
    }

    expiredCheckoutResults.push({
      sessionId: session.id,
      remoteExpired,
      remoteError,
    });
  }

  const failedRefunds = await db.guestPayMongoRefund.findMany({
    where: { status: GuestPayMongoRefundStatus.FAILED },
    select: {
      id: true,
      errorMessage: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: 50,
  });

  const manualReviewRefunds = failedRefunds.filter((refund) =>
    String(refund.errorMessage ?? '').startsWith(
      MANUAL_REFUND_REQUIRED_PREFIX
    )
  );

  const retryableRefunds = failedRefunds
    .filter(
      (refund) =>
        !String(refund.errorMessage ?? '').startsWith(
          MANUAL_REFUND_REQUIRED_PREFIX
        )
    )
    .slice(0, 20);

  const refundResults = [];

  for (const refund of retryableRefunds) {
    try {
      refundResults.push({
        refundRecordId: refund.id,
        ...(await retryGuestPayMongoRefund(refund.id)),
      });
    } catch (error) {
      refundResults.push({
        refundRecordId: refund.id,
        ok: false,
        skipped: false,
        message:
          error instanceof Error
            ? error.message
            : 'Unexpected refund retry error.',
      });
    }
  }

  const unrecordedSessions = await db.guestPayMongoSession.findMany({
    where: {
      automaticRefundEnabled: true,
      paymongoPaymentId: { not: null },
      status: GuestPayMongoStatus.PAID_REVIEW_REQUIRED,
      refunds: { none: {} },
    },
    select: {
      id: true,
      errorMessage: true,
      refundReason: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: 20,
  });

  const sessionResults = [];

  for (const session of unrecordedSessions) {
    try {
      sessionResults.push({
        sessionId: session.id,
        ...(await requestAutomaticGuestRefund({
          sessionId: session.id,
          reason:
            session.refundReason ||
            session.errorMessage ||
            'Retrying automatic refund after guest transaction failure.',
        })),
      });
    } catch (error) {
      sessionResults.push({
        sessionId: session.id,
        ok: false,
        skipped: false,
        message:
          error instanceof Error
            ? error.message
            : 'Unexpected automatic refund error.',
      });
    }
  }

  return NextResponse.json({
    ok: true,
    expiredCheckoutsScanned: expiredCheckoutCandidates.length,
    expiredCheckoutResults,
    failedRefundsScanned: failedRefunds.length,
    retryableRefundsScanned: retryableRefunds.length,
    manualReviewRefundsSkipped: manualReviewRefunds.length,
    manualReviewRefundIds: manualReviewRefunds.map((refund) => refund.id),
    unrecordedSessionsScanned: unrecordedSessions.length,
    refundResults,
    sessionResults,
  });
}

export const POST = run;
export const GET = run;

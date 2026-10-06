import { NextResponse } from 'next/server';
import {
  GuestXenditFlow,
  GuestXenditRefundStatus,
  GuestXenditStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import { expireXenditCheckoutSession } from '@/lib/xendit';
import { getXenditForUserIdFromPayload } from '@/lib/xendit-split';
import {
  requestAutomaticGuestRefund,
  retryGuestXenditRefund,
} from '@/lib/guest-xendit-refund';
import {
  cleanupStagedGuestServiceAttachments,
  type StagedServiceAttachment,
} from '@/lib/guest-service-order';
import {
  MANUAL_REFUND_REQUIRED_PREFIX,
  refundRetryDecision,
} from '@/lib/xendit-refund-retry';
import { notifyGuestXenditRefundStatus } from '@/lib/xendit-dashboard-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


function isAuthorized(request: Request) {
  const secret =
    process.env.XENDIT_REFUND_CRON_SECRET?.trim() ||
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

  const expiredCheckoutCandidates = await db.guestXenditSession.findMany({
    where: {
      paymentProvider: 'XENDIT',
      status: GuestXenditStatus.PENDING,
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
    const expired = await db.guestXenditSession.updateMany({
      where: {
        id: session.id,
        status: GuestXenditStatus.PENDING,
      },
      data: {
        status: GuestXenditStatus.EXPIRED,
        checkoutExpiredAt: new Date(),
        errorMessage: 'The guest Xendit checkout expired before payment.',
      },
    });

    if (expired.count !== 1) continue;

    let remoteExpired = false;
    let remoteError: string | null = null;

    if (session.flowType === GuestXenditFlow.SERVICE_REQUEST) {
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
        await expireXenditCheckoutSession(
          session.checkoutSessionId,
          getXenditForUserIdFromPayload(session.payload)
        );
        remoteExpired = true;
      } catch (error) {
        remoteError =
          error instanceof Error
            ? error.message
            : 'Unable to expire the Xendit checkout session.';

        console.warn(
          '[Guest Xendit maintenance] Checkout expiration failed.',
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

  const now = new Date();

  const failedRefunds = await db.guestXenditRefund.findMany({
    where: {
      status: GuestXenditRefundStatus.FAILED,
      guestPaymentSession: { paymentProvider: 'XENDIT' },
    },
    select: {
      id: true,
      errorMessage: true,
      requestedAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'asc' },
    take: 50,
  });

  /*
   * Every failed refund used to be retried on every pass unless its message
   * began with MANUAL REFUND REQUIRED — a message only ever written by a check
   * made before the call. Two refunds whose channel Xendit refused in its
   * *reply* were therefore retried every five minutes for eighty-one days,
   * announcing a start and a failure each time. The rule now reads the reply,
   * spaces the attempts, and gives unrecognised errors a deadline.
   */
  const decisions = failedRefunds.map((refund) => ({
    refund,
    decision: refundRetryDecision({
      errorMessage: refund.errorMessage,
      requestedAt: refund.requestedAt,
      updatedAt: refund.updatedAt,
      now,
    }),
  }));

  /* Permanent, or past the deadline: write the reason once and stop. */
  const refundsToPark = decisions.filter((d) => d.decision.action === 'park');

  for (const { refund, decision } of refundsToPark) {
    await db.guestXenditRefund.update({
      where: { id: refund.id },
      data: {
        errorMessage:
          `${MANUAL_REFUND_REQUIRED_PREFIX} ${decision.reason}`.slice(0, 2000),
      },
    });

    /*
     * Once, and then never again: after this write the refund is skipped on
     * every future pass, so this is the last thing anyone hears about it from
     * the retry worker. "This is now yours" is worth one notification; the
     * ninety thousand that preceded it were not.
     */
    try {
      await notifyGuestXenditRefundStatus({ refundId: refund.id });
    } catch (error) {
      console.warn('[refund-retry] Unable to announce a parked refund.', {
        refundId: refund.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const manualReviewRefunds = [
    ...decisions.filter((d) => d.decision.action === 'skip'),
    ...refundsToPark,
  ].map((d) => d.refund);

  const retryableRefunds = decisions
    .filter((d) => d.decision.action === 'retry')
    .map((d) => d.refund)
    .slice(0, 20);

  const refundResults = [];

  for (const refund of retryableRefunds) {
    try {
      refundResults.push({
        refundRecordId: refund.id,
        ...(await retryGuestXenditRefund(refund.id)),
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

  const unrecordedSessions = await db.guestXenditSession.findMany({
    where: {
      paymentProvider: 'XENDIT',
      automaticRefundEnabled: true,
      xenditPaymentId: { not: null },
      status: GuestXenditStatus.PAID_REVIEW_REQUIRED,
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

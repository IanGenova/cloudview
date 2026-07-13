import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import {
  GuestXenditFlow,
  GuestXenditStatus,
  POSXenditStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import {
  applyGuestRefundWebhookUpdateTx,
  requestAutomaticGuestRefund,
} from '@/lib/guest-xendit-refund';
import {
  cleanupStagedGuestServiceAttachments,
  type StagedServiceAttachment,
} from '@/lib/guest-service-order';
import {
  notifyGuestXenditRefundStatus,
  notifyGuestXenditStatus,
  notifyPosXenditStatus,
} from '@/lib/xendit-dashboard-notifications';
import { xenditAmountToCents } from '@/lib/xendit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

type XenditWebhook = {
  event?: string;
  business_id?: string;
  created?: string;
  data?: JsonRecord;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asMetadata(value: unknown) {
  const record = asRecord(value);
  const result: Record<string, string> = {};

  for (const [key, item] of Object.entries(record ?? {})) {
    if (typeof item === 'string') result[key] = item;
    else if (typeof item === 'number' || typeof item === 'boolean') {
      result[key] = String(item);
    }
  }

  return result;
}

function safeTextEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyWebhookToken(request: Request) {
  const expected = process.env.XENDIT_WEBHOOK_TOKEN?.trim();
  const supplied = request.headers.get('x-callback-token')?.trim();

  if (!expected) {
    throw new Error('XENDIT_WEBHOOK_TOKEN is not configured.');
  }

  return Boolean(supplied && safeTextEqual(expected, supplied));
}

function validPaymentId(value: string | null) {
  return Boolean(value && /^py-[A-Za-z0-9-]+$/.test(value));
}

function validPaymentRequestId(value: string | null) {
  return Boolean(value && /^pr-[A-Za-z0-9-]+$/.test(value));
}

function mergeSessionPayload(
  value: Prisma.JsonValue,
  updates: Record<string, Prisma.JsonValue>
): Prisma.InputJsonValue {
  const current =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Prisma.JsonObject)
      : {};

  return { ...current, ...updates } as Prisma.InputJsonValue;
}

function eventId(rawBody: string, body: XenditWebhook) {
  return `xw_${createHash('sha256')
    .update(`${body.event || 'unknown'}:${body.created || ''}:${rawBody}`)
    .digest('hex')}`;
}

function getPaymentDetails(body: XenditWebhook) {
  const data = asRecord(body.data) ?? {};
  const metadata = asMetadata(data.metadata);

  return {
    eventType: asString(body.event) || 'unknown',
    checkoutSessionId: asString(data.payment_session_id),
    referenceId: asString(data.reference_id),
    paymentId:
      asString(data.payment_id) ||
      asString(data.latest_payment_id),
    paymentRequestId: asString(data.payment_request_id),
    amountCents: xenditAmountToCents(data.request_amount ?? data.amount),
    currency: (asString(data.currency) || '').toUpperCase(),
    channelCode: asString(data.channel_code),
    metadata,
    status: asString(data.status),
  };
}

async function findGuestSession(
  tx: Prisma.TransactionClient,
  candidateIds: Array<string | null | undefined>,
  checkoutSessionId: string | null
) {
  for (const id of Array.from(new Set(candidateIds.filter(Boolean)))) {
    const session = await tx.guestXenditSession.findUnique({
      where: { id: id as string, paymentProvider: 'XENDIT' },
    });
    if (session) return session;
  }

  return checkoutSessionId
    ? tx.guestXenditSession.findFirst({
        where: { checkoutSessionId, paymentProvider: 'XENDIT' },
        orderBy: { createdAt: 'desc' },
      })
    : null;
}

async function findPosSession(
  tx: Prisma.TransactionClient,
  candidateIds: Array<string | null | undefined>,
  checkoutSessionId: string | null
) {
  for (const id of Array.from(new Set(candidateIds.filter(Boolean)))) {
    const session = await tx.posXenditSession.findUnique({
      where: { id: id as string, paymentProvider: 'XENDIT' },
    });
    if (session) return session;
  }

  return checkoutSessionId
    ? tx.posXenditSession.findFirst({
        where: { checkoutSessionId, paymentProvider: 'XENDIT' },
        orderBy: { createdAt: 'desc' },
      })
    : null;
}

function isGuestFlow(metadata: Record<string, string>) {
  const flow = (
    metadata.flow_type ||
    metadata.flow ||
    metadata.payment_flow ||
    ''
  ).toUpperCase();

  return (
    Boolean(metadata.guest_payment_session_id || metadata.guest_xendit_session_id) ||
    flow.includes('GUEST_FOOD') ||
    flow.includes('GUEST_SERVICE')
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifyWebhookToken(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid webhook token.' }, { status: 401 });
  }

  let body: XenditWebhook;
  try {
    body = JSON.parse(rawBody) as XenditWebhook;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const type = asString(body.event) || 'unknown';
  const id = eventId(rawBody, body);
  const livemode = process.env.XENDIT_LIVEMODE === 'true';

  let guestNotificationSessionId: string | null = null;
  let posNotificationSessionId: string | null = null;
  let refundNotificationId: string | null = null;
  let automaticRefundSessionId: string | null = null;
  let automaticRefundReason: string | null = null;
  const cleanupGuestSessionIds = new Set<string>();

  try {
    await db.$transaction(
      async (tx) => {
        const existing = await tx.xenditWebhookEvent.findUnique({ where: { id } });
        if (existing) return;

        if (type === 'payment.capture') {
          const payment = getPaymentDetails(body);
          const candidateIds = [
            payment.referenceId,
            payment.metadata.guest_payment_session_id,
            payment.metadata.guest_xendit_session_id,
            payment.metadata.pos_session_id,
            payment.metadata.posSessionId,
            payment.metadata.xendit_session_id,
          ];

          let guestSession = isGuestFlow(payment.metadata)
            ? await findGuestSession(tx, candidateIds, payment.checkoutSessionId)
            : null;
          let posSession = guestSession
            ? null
            : await findPosSession(tx, candidateIds, payment.checkoutSessionId);

          if (!guestSession && !posSession) {
            guestSession = await findGuestSession(tx, candidateIds, payment.checkoutSessionId);
          }
          if (!guestSession && !posSession) {
            posSession = await findPosSession(tx, candidateIds, payment.checkoutSessionId);
          }

          if (!guestSession && !posSession) {
            throw new Error(
              `No CloudView session matched Xendit event ${type}; reference=${payment.referenceId || 'missing'} session=${payment.checkoutSessionId || 'missing'}.`
            );
          }

          const hasPayment = validPaymentId(payment.paymentId);
          const hasRequest = validPaymentRequestId(payment.paymentRequestId);
          const paymentSucceeded = payment.status === 'SUCCEEDED';

          if (guestSession) {
            if (
              payment.checkoutSessionId &&
              guestSession.checkoutSessionId &&
              guestSession.checkoutSessionId !== payment.checkoutSessionId
            ) {
              throw new Error(`Guest Payment Session ID mismatch for ${guestSession.id}.`);
            }

            if (guestSession.status !== GuestXenditStatus.COMPLETED) {
              const amountMatches = payment.amountCents === guestSession.amountCents;
              const currencyMatches =
                payment.currency === (guestSession.currency || 'PHP').toUpperCase();
              const valid =
                paymentSucceeded &&
                hasPayment &&
                hasRequest &&
                amountMatches &&
                currencyMatches;
              const message = valid
                ? null
                : `Xendit validation failed. Expected ${guestSession.amountCents} ${guestSession.currency}; received ${payment.amountCents ?? 'unknown'} ${payment.currency || 'unknown'}, payment=${payment.paymentId || 'missing'}, request=${payment.paymentRequestId || 'missing'}.`;

              await tx.guestXenditSession.update({
                where: { id: guestSession.id },
                data: {
                  status: valid
                    ? GuestXenditStatus.PAID
                    : GuestXenditStatus.PAID_REVIEW_REQUIRED,
                  xenditPaymentId: payment.paymentId,
                  xenditPaymentRequestId: payment.paymentRequestId,
                  paymentSourceType: payment.channelCode,
                  paidAmountCents: payment.amountCents,
                  paidAt: new Date(),
                  errorMessage: message,
                  payload: mergeSessionPayload(guestSession.payload, {
                    xenditPaymentId: payment.paymentId || '',
                    xenditPaymentRequestId: payment.paymentRequestId || '',
                    xenditCheckoutSessionId: payment.checkoutSessionId || '',
                    xenditSourceType: payment.channelCode || '',
                    xenditPaidAmountCents: payment.amountCents || 0,
                  }),
                },
              });

              guestNotificationSessionId = guestSession.id;

              if (!valid && paymentSucceeded && hasPayment && hasRequest) {
                automaticRefundSessionId = guestSession.id;
                automaticRefundReason = message;
                cleanupGuestSessionIds.add(guestSession.id);
              }
            }
          } else if (posSession) {
            if (
              payment.checkoutSessionId &&
              posSession.checkoutSessionId &&
              posSession.checkoutSessionId !== payment.checkoutSessionId
            ) {
              throw new Error(`POS Payment Session ID mismatch for ${posSession.id}.`);
            }

            if (posSession.status !== POSXenditStatus.COMPLETED) {
              const valid =
                paymentSucceeded &&
                hasPayment &&
                hasRequest &&
                payment.amountCents === posSession.amountCents &&
                payment.currency === (posSession.currency || 'PHP').toUpperCase();
              const message = valid
                ? null
                : `Xendit validation failed. Expected ${posSession.amountCents} ${posSession.currency}; received ${payment.amountCents ?? 'unknown'} ${payment.currency || 'unknown'}, payment=${payment.paymentId || 'missing'}, request=${payment.paymentRequestId || 'missing'}.`;

              await tx.posXenditSession.update({
                where: { id: posSession.id },
                data: {
                  status: valid
                    ? POSXenditStatus.PAID
                    : POSXenditStatus.PAID_REVIEW_REQUIRED,
                  xenditPaymentId: payment.paymentId,
                  xenditPaymentRequestId: payment.paymentRequestId,
                  paymentSourceType: payment.channelCode,
                  paidAmountCents: payment.amountCents,
                  paidAt: new Date(),
                  errorMessage: message,
                  payload: mergeSessionPayload(posSession.payload, {
                    xenditPaymentId: payment.paymentId || '',
                    xenditPaymentRequestId: payment.paymentRequestId || '',
                    xenditCheckoutSessionId: payment.checkoutSessionId || '',
                    xenditSourceType: payment.channelCode || '',
                    xenditPaidAmountCents: payment.amountCents || 0,
                  }),
                },
              });

              posNotificationSessionId = posSession.id;
            }
          }
        } else if (type === 'payment_session.expired') {
          const payment = getPaymentDetails(body);
          const candidates = [
            payment.referenceId,
            payment.metadata.guest_payment_session_id,
            payment.metadata.guest_xendit_session_id,
            payment.metadata.pos_session_id,
            payment.metadata.xendit_session_id,
          ];
          const guestSession = await findGuestSession(
            tx,
            candidates,
            payment.checkoutSessionId
          );

          if (guestSession) {
            const update = await tx.guestXenditSession.updateMany({
              where: { id: guestSession.id, status: GuestXenditStatus.PENDING },
              data: {
                status: GuestXenditStatus.EXPIRED,
                checkoutExpiredAt: new Date(),
                errorMessage: 'The Xendit Payment Session expired before payment was completed.',
              },
            });
            if (update.count) {
              guestNotificationSessionId = guestSession.id;
              cleanupGuestSessionIds.add(guestSession.id);
            }
          } else {
            const posSession = await findPosSession(tx, candidates, payment.checkoutSessionId);
            if (posSession) {
              const update = await tx.posXenditSession.updateMany({
                where: { id: posSession.id, status: POSXenditStatus.PENDING },
                data: {
                  status: POSXenditStatus.CANCELLED,
                  errorMessage: 'The Xendit Payment Session expired before payment was completed.',
                },
              });
              if (update.count) posNotificationSessionId = posSession.id;
            }
          }
        } else if (type === 'payment.failure') {
          const payment = getPaymentDetails(body);
          const candidates = [
            payment.referenceId,
            payment.metadata.guest_payment_session_id,
            payment.metadata.guest_xendit_session_id,
            payment.metadata.pos_session_id,
            payment.metadata.xendit_session_id,
          ];
          const guestSession = await findGuestSession(tx, candidates, null);

          if (guestSession) {
            const update = await tx.guestXenditSession.updateMany({
              where: { id: guestSession.id, status: GuestXenditStatus.PENDING },
              data: {
                status: GuestXenditStatus.FAILED,
                errorMessage: `Xendit payment failed${payment.status ? ` (${payment.status})` : ''}. The guest may create a new checkout.`,
              },
            });
            if (update.count) {
              guestNotificationSessionId = guestSession.id;
              cleanupGuestSessionIds.add(guestSession.id);
            }
          } else {
            const posSession = await findPosSession(tx, candidates, null);
            if (posSession) {
              const update = await tx.posXenditSession.updateMany({
                where: { id: posSession.id, status: POSXenditStatus.PENDING },
                data: {
                  status: POSXenditStatus.FAILED,
                  errorMessage: 'Xendit reported that the payment attempt failed.',
                },
              });
              if (update.count) posNotificationSessionId = posSession.id;
            }
          }
        } else if (type === 'split.payment') {
          const data = asRecord(body.data) ?? {};
          const splitPaymentId = asString(data.id);
          const paymentId = asString(data.payment_id);
          const splitStatus = (asString(data.status) || '').toUpperCase();
          const splitAmountCents = xenditAmountToCents(data.amount);
          const splitFailureCode = asString(data.failure_code);

          if (!splitPaymentId || !validPaymentId(paymentId)) {
            throw new Error('Xendit split.payment webhook is missing its split or payment ID.');
          }

          if (splitStatus !== 'COMPLETED' && splitStatus !== 'FAILED') {
            throw new Error(`Unsupported Xendit split status: ${splitStatus || 'missing'}.`);
          }

          const guestSession = await tx.guestXenditSession.findFirst({
            where: { xenditPaymentId: paymentId, paymentProvider: 'XENDIT' },
            orderBy: { createdAt: 'desc' },
          });

          if (guestSession) {
            await tx.guestXenditSession.update({
              where: { id: guestSession.id },
              data: {
                xenditSplitPaymentId: splitPaymentId,
                xenditSplitStatus: splitStatus,
                xenditSplitAmountCents: splitAmountCents,
                xenditSplitFailureCode:
                  splitStatus === 'FAILED' ? splitFailureCode || 'UNKNOWN' : null,
                ...(splitStatus === 'FAILED'
                  ? {
                      errorMessage: `Payment succeeded, but Xendit split routing failed (${splitFailureCode || 'UNKNOWN'}). Manual hotel settlement is required.`,
                    }
                  : {}),
              },
            });
            guestNotificationSessionId = guestSession.id;
          } else {
            const posSession = await tx.posXenditSession.findFirst({
              where: { xenditPaymentId: paymentId, paymentProvider: 'XENDIT' },
              orderBy: { createdAt: 'desc' },
            });

            if (!posSession) {
              throw new Error(
                `No CloudView payment matched Xendit split event for ${paymentId}.`
              );
            }

            await tx.posXenditSession.update({
              where: { id: posSession.id },
              data: {
                xenditSplitPaymentId: splitPaymentId,
                xenditSplitStatus: splitStatus,
                xenditSplitAmountCents: splitAmountCents,
                xenditSplitFailureCode:
                  splitStatus === 'FAILED' ? splitFailureCode || 'UNKNOWN' : null,
                ...(splitStatus === 'FAILED'
                  ? {
                      errorMessage: `Payment succeeded, but Xendit split routing failed (${splitFailureCode || 'UNKNOWN'}). Manual hotel settlement is required.`,
                    }
                  : {}),
              },
            });
            posNotificationSessionId = posSession.id;
          }
        } else if (type === 'refund.succeeded' || type === 'refund.failed') {
          const data = asRecord(body.data) ?? {};
          const updatedRefund = await applyGuestRefundWebhookUpdateTx(tx, {
            refundId: asString(data.id),
            paymentId: asString(data.payment_id),
            amountCents: xenditAmountToCents(data.amount),
            status: type === 'refund.succeeded' ? 'succeeded' : 'failed',
          });
          refundNotificationId = updatedRefund?.id ?? null;
        }

        await tx.xenditWebhookEvent.create({
          data: { id, type, livemode },
        });
      },
      { maxWait: 10_000, timeout: 30_000 }
    );
  } catch (error) {
    console.error('[Xendit webhook] Processing failed.', {
      id,
      type,
      message: getErrorMessage(error),
    });

    return NextResponse.json(
      { ok: false, retryable: true, eventId: id, eventType: type },
      { status: 503 }
    );
  }

  await Promise.allSettled([
    guestNotificationSessionId
      ? notifyGuestXenditStatus({ sessionId: guestNotificationSessionId, eventId: id })
      : Promise.resolve(null),
    posNotificationSessionId
      ? notifyPosXenditStatus({ sessionId: posNotificationSessionId, eventId: id })
      : Promise.resolve(null),
    refundNotificationId
      ? notifyGuestXenditRefundStatus({ refundId: refundNotificationId, eventId: id })
      : Promise.resolve(null),
  ]);

  if (automaticRefundSessionId) {
    await requestAutomaticGuestRefund({
      sessionId: automaticRefundSessionId,
      reason: automaticRefundReason || 'Payment validation failed.',
    }).catch((error) => {
      console.error('[Xendit webhook] Automatic refund request failed.', {
        sessionId: automaticRefundSessionId,
        message: getErrorMessage(error),
      });
    });
  }

  for (const sessionId of cleanupGuestSessionIds) {
    try {
      const session = await db.guestXenditSession.findUnique({
        where: { id: sessionId },
        select: { flowType: true, payload: true },
      });

      if (
        session?.flowType === GuestXenditFlow.SERVICE_REQUEST &&
        session.payload &&
        typeof session.payload === 'object' &&
        !Array.isArray(session.payload)
      ) {
        const payload = session.payload as { stagedAttachments?: StagedServiceAttachment[] };
        if (Array.isArray(payload.stagedAttachments)) {
          await cleanupStagedGuestServiceAttachments(payload.stagedAttachments);
        }
      }
    } catch (error) {
      console.error('[Xendit webhook] Attachment cleanup failed.', {
        sessionId,
        message: getErrorMessage(error),
      });
    }
  }

  return NextResponse.json({ ok: true, eventId: id, eventType: type });
}

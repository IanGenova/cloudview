import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import {
  GuestPayMongoFlow,
  GuestPayMongoStatus,
  POSPayMongoStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import {
  applyGuestRefundWebhookUpdateTx,
  requestAutomaticGuestRefund,
} from '@/lib/guest-paymongo-refund';
import {
  cleanupStagedGuestServiceAttachments,
  type StagedServiceAttachment,
} from '@/lib/guest-service-order';
import {
  notifyGuestPayMongoRefundStatus,
  notifyGuestPayMongoStatus,
  notifyPosPayMongoStatus,
} from '@/lib/paymongo-dashboard-notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

type PayMongoEvent = {
  /**
   * PayMongo Hosted Checkout V2 currently includes `event_type` at the
   * top level. Older JSON:API webhook envelopes do not.
   */
  event_type?: string;
  data?: {
    id?: string;
    type?: string;
    resource?: string;
    livemode?: boolean;
    data?: JsonRecord;
    attributes?: {
      type?: string;
      livemode?: boolean;
      data?: JsonRecord;
    };
  };
};

type ParsedSignatureHeader = {
  timestamp?: string;
  testSignature?: string;
  liveSignature?: string;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getAttributes(resource: JsonRecord | null) {
  return asRecord(resource?.attributes);
}

function getMetadata(attributes: JsonRecord | null) {
  const metadata = asRecord(attributes?.metadata);
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }

  return result;
}

function safeHexEqual(left: string, right: string) {
  const normalizedLeft = left.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();

  if (
    !/^[a-f0-9]+$/.test(normalizedLeft) ||
    !/^[a-f0-9]+$/.test(normalizedRight)
  ) {
    return false;
  }

  const leftBuffer = Buffer.from(normalizedLeft, 'hex');
  const rightBuffer = Buffer.from(normalizedRight, 'hex');

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function parseSignatureHeader(header: string): ParsedSignatureHeader {
  const values = new Map<string, string>();

  for (const part of header.split(',')) {
    const separatorIndex = part.indexOf('=');

    if (separatorIndex <= 0) continue;

    values.set(
      part.slice(0, separatorIndex).trim(),
      part.slice(separatorIndex + 1).trim()
    );
  }

  return {
    timestamp: values.get('t'),
    testSignature: values.get('te'),
    liveSignature: values.get('li'),
  };
}

function verifySignature(input: {
  rawBody: string;
  signatureHeader: string;
  secret: string;
  expectedLivemode: boolean;
}) {
  const parsed = parseSignatureHeader(input.signatureHeader);

  if (parsed.timestamp) {
    const suppliedSignature = input.expectedLivemode
      ? parsed.liveSignature
      : parsed.testSignature;

    if (!suppliedSignature) return false;

    const expectedSignature = createHmac('sha256', input.secret)
      .update(`${parsed.timestamp}.${input.rawBody}`)
      .digest('hex');

    return safeHexEqual(expectedSignature, suppliedSignature);
  }

  const expectedSignature = createHmac('sha256', input.secret)
    .update(input.rawBody)
    .digest('hex');

  return safeHexEqual(expectedSignature, input.signatureHeader);
}

function getEventDetails(event: PayMongoEvent) {
  const envelope = event.data;
  const legacyAttributes = envelope?.attributes;

  const envelopeType = asString(envelope?.type);
  const legacyEventType = asString(legacyAttributes?.type);

  /**
   * PayMongo has two webhook envelope formats in circulation:
   *
   * Hosted Checkout V2:
   *   data.type = "checkout_session.payment.paid"
   *   data.data = checkout session resource
   *
   * JSON:API event envelope:
   *   data.type = "event"
   *   data.attributes.type = "checkout_session.payment.paid"
   *   data.attributes.data = checkout session resource
   *
   * The previous parser preferred `data.type`, so JSON:API events were
   * incorrectly stored as the literal type "event" and never processed.
   */
  const eventType =
    legacyEventType ??
    (envelopeType && envelopeType.toLowerCase() !== 'event'
      ? envelopeType
      : null);

  const livemode =
    typeof legacyAttributes?.livemode === 'boolean'
      ? legacyAttributes.livemode
      : typeof envelope?.livemode === 'boolean'
        ? envelope.livemode
        : false;

  const resource = asRecord(legacyAttributes?.data ?? envelope?.data);

  return {
    eventId: asString(envelope?.id) ?? undefined,
    eventType,
    livemode,
    resource,
    envelopeFormat: legacyEventType ? 'json-api-event' : 'hosted-checkout-v2',
  };
}

function getPaidPayment(checkoutAttributes: JsonRecord | null) {
  const paymentIntent = asRecord(checkoutAttributes?.payment_intent);
  const paymentIntentAttributes = getAttributes(paymentIntent);
  const directPayments = Array.isArray(checkoutAttributes?.payments)
    ? checkoutAttributes.payments
    : [];
  const intentPayments = Array.isArray(paymentIntentAttributes?.payments)
    ? paymentIntentAttributes.payments
    : [];
  const payments = [...directPayments, ...intentPayments]
    .map(asRecord)
    .filter((value): value is JsonRecord => Boolean(value));

  return (
    payments.find(
      (payment) => asString(getAttributes(payment)?.status) === 'paid'
    ) ??
    payments[0] ??
    null
  );
}

function createDeterministicEventId(rawBody: string, suppliedEventId?: string) {
  return (
    suppliedEventId ||
    `pmw_${createHash('sha256').update(rawBody).digest('hex')}`
  );
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


async function findGuestSessionForCheckout(
  tx: Prisma.TransactionClient,
  input: {
    candidateIds: Array<string | null | undefined>;
    checkoutSessionId: string | null;
  }
) {
  const candidateIds = Array.from(
    new Set(
      input.candidateIds
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );

  for (const id of candidateIds) {
    const session = await tx.guestPayMongoSession.findUnique({
      where: { id },
    });

    if (session) return session;
  }

  if (input.checkoutSessionId) {
    return tx.guestPayMongoSession.findFirst({
      where: { checkoutSessionId: input.checkoutSessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  return null;
}

async function findPosSessionForCheckout(
  tx: Prisma.TransactionClient,
  input: {
    candidateIds: Array<string | null | undefined>;
    checkoutSessionId: string | null;
  }
) {
  const candidateIds = Array.from(
    new Set(
      input.candidateIds
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );

  for (const id of candidateIds) {
    const session = await tx.posPayMongoSession.findUnique({
      where: { id },
    });

    if (session) return session;
  }

  if (input.checkoutSessionId) {
    return tx.posPayMongoSession.findFirst({
      where: { checkoutSessionId: input.checkoutSessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  return null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : 'Unknown webhook processing error.';
}

function getRefundEventDetails(eventType: string, resource: JsonRecord | null) {
  const attributes = getAttributes(resource);
  const resourceType = asString(resource?.type);

  if (resourceType === 'refund' || asString(attributes?.payment_id)) {
    return {
      refundId: asString(resource?.id),
      paymentId: asString(attributes?.payment_id),
      amount: asNumber(attributes?.amount),
      status:
        asString(attributes?.status) ||
        (eventType === 'payment.refunded' ? 'succeeded' : null),
    };
  }

  const refunds = Array.isArray(attributes?.refunds)
    ? attributes.refunds.map(asRecord).filter(Boolean)
    : [];
  const latestRefund = (refunds[refunds.length - 1] ?? null) as JsonRecord | null;
  const latestAttributes = getAttributes(latestRefund);

  return {
    refundId: asString(latestRefund?.id),
    paymentId: asString(resource?.id),
    amount: asNumber(latestAttributes?.amount),
    status:
      asString(latestAttributes?.status) ||
      (eventType === 'payment.refunded' ? 'succeeded' : null),
  };
}

export async function POST(request: Request) {
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET?.trim();
  const expectedLivemode = process.env.PAYMONGO_LIVEMODE === 'true';

  if (!webhookSecret) {
    console.error('[PayMongo webhook] PAYMONGO_WEBHOOK_SECRET is missing.');

    return NextResponse.json(
      { ok: false, error: 'Webhook secret is not configured.' },
      { status: 500 }
    );
  }

  const rawBody = await request.text();
  const signatureHeader =
    request.headers.get('paymongo-signature') ??
    request.headers.get('x-paymongo-signature');

  if (
    !signatureHeader ||
    !verifySignature({
      rawBody,
      signatureHeader,
      secret: webhookSecret,
      expectedLivemode,
    })
  ) {
    return NextResponse.json(
      { ok: false, error: 'Invalid signature.' },
      { status: 401 }
    );
  }

  let event: PayMongoEvent;

  try {
    event = JSON.parse(rawBody) as PayMongoEvent;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON.' },
      { status: 400 }
    );
  }

  const details = getEventDetails(event);
  const eventId = createDeterministicEventId(rawBody, details.eventId);

  if (!details.eventType) {
    return NextResponse.json({ ok: true, ignored: 'missing-event-type' });
  }

  // Preserve the validated non-null event type across async transaction callbacks.
  // TypeScript does not reliably retain property narrowing for details.eventType
  // once it is captured inside the Prisma transaction closure.
  const eventType: string = details.eventType;

  if (details.livemode !== expectedLivemode) {
    console.warn('[PayMongo webhook] Ignoring event with mode mismatch.', {
      eventId,
      eventType,
      receivedLivemode: details.livemode,
      expectedLivemode,
      envelopeFormat: details.envelopeFormat,
    });

    return NextResponse.json({ ok: true, ignored: 'mode-mismatch' });
  }

  console.info('[PayMongo webhook] Verified event.', {
    eventId,
    eventType,
    livemode: details.livemode,
    envelopeFormat: details.envelopeFormat,
    resourceType: asString(details.resource?.type),
    resourceId: asString(details.resource?.id),
  });

  let automaticRefundSessionId: string | null = null;
  let automaticRefundReason = '';
  let guestNotificationSessionId: string | null = null;
  let posNotificationSessionId: string | null = null;
  let refundNotificationId: string | null = null;
  const cleanupGuestSessionIds = new Set<string>();

  try {
    await db.$transaction(
      async (tx) => {
        const existingWebhookEvent = await tx.payMongoWebhookEvent.findUnique({
          where: { id: eventId },
          select: { id: true, type: true },
        });

        /**
         * Payment and refund events are safe to re-evaluate idempotently.
         *
         * This is important because an older handler may have inserted the
         * webhook event row even when it failed to find the CloudView payment
         * session. A manual PayMongo resend must still be able to repair that
         * payment instead of being skipped forever as a duplicate.
         */
        const isReplayableFinancialEvent =
          eventType === 'checkout_session.payment.paid' ||
          eventType === 'payment.refunded' ||
          eventType === 'payment.refund.updated';

        const recoverPreviouslyMisparsedEvent = Boolean(
          existingWebhookEvent &&
            existingWebhookEvent.type === 'event' &&
            eventType !== 'event'
        );

        if (
          existingWebhookEvent &&
          !recoverPreviouslyMisparsedEvent &&
          !isReplayableFinancialEvent
        ) {
          return;
        }

        if (eventType === 'checkout_session.payment.paid') {
          const checkout = details.resource;
          const checkoutId = asString(checkout?.id);
          const attributes = getAttributes(checkout);
          const metadata = getMetadata(attributes);
          const referenceNumber = asString(attributes?.reference_number);
          const flowType = (metadata.flow_type || '').toUpperCase();

          if (!checkoutId) {
            throw new Error(
              'PayMongo checkout_session.payment.paid did not include a checkout session ID.'
            );
          }

          const payment = getPaidPayment(attributes);
          const paymentAttributes = getAttributes(payment);
          const paymentIntent = asRecord(attributes?.payment_intent);
          const paymentIntentAttributes = getAttributes(paymentIntent);
          const paymentId = asString(payment?.id);
          const source = asRecord(paymentAttributes?.source);
          const sourceType = asString(source?.type)?.toLowerCase() ?? null;
          const paidAmount =
            asNumber(paymentAttributes?.amount) ??
            asNumber(paymentIntentAttributes?.amount);
          const netAmount = asNumber(paymentAttributes?.net_amount);
          const paidCurrency = (
            asString(paymentAttributes?.currency) ??
            asString(paymentIntentAttributes?.currency) ??
            'PHP'
          ).toUpperCase();

          const guestPaymentSessionId =
            metadata.guest_payment_session_id ||
            metadata.guest_paymongo_session_id ||
            metadata.guest_stay_paymongo_session_id;

          /**
           * Do not rely only on metadata. Older checkouts, V1 fallbacks, or
           * renamed metadata keys can still be reconciled by reference number
           * or by the stored PayMongo checkout session ID.
           */
          const guestSession = await findGuestSessionForCheckout(tx, {
            candidateIds: [guestPaymentSessionId, referenceNumber],
            checkoutSessionId: checkoutId,
          });

          if (guestSession) {
            if (guestSession.checkoutSessionId !== checkoutId) {
              throw new Error(
                `Guest checkout ID mismatch for session ${guestSession.id}.`
              );
            }

            if (
              guestSession.status !== GuestPayMongoStatus.COMPLETED &&
              guestSession.status !== GuestPayMongoStatus.REFUNDED
            ) {
              const amountMatches =
                paidAmount === guestSession.amountCents ||
                netAmount === guestSession.amountCents;
              const currencyMatches =
                paidCurrency ===
                (guestSession.currency || 'PHP').toUpperCase();
              const wasClosedBeforePayment =
                guestSession.status === GuestPayMongoStatus.CANCELLED ||
                guestSession.status === GuestPayMongoStatus.EXPIRED;

              if (
                !amountMatches ||
                !currencyMatches ||
                wasClosedBeforePayment
              ) {
                const message = wasClosedBeforePayment
                  ? `PayMongo reported a payment after the checkout was ${guestSession.status.toLowerCase()}. An automatic refund is required.`
                  : `PayMongo amount mismatch. Expected ${guestSession.amountCents} ${guestSession.currency}; received ${paidAmount ?? 'unknown'} ${paidCurrency}${
                      typeof netAmount === 'number'
                        ? ` with net ${netAmount}.`
                        : '.'
                    }`;

                await tx.guestPayMongoSession.update({
                  where: { id: guestSession.id },
                  data: {
                    status: GuestPayMongoStatus.PAID_REVIEW_REQUIRED,
                    paymongoPaymentId: paymentId,
                    paymentSourceType: sourceType,
                    paidAmountCents: paidAmount,
                    netAmountCents: netAmount,
                    feeCents: asNumber(paymentAttributes?.fee),
                    paidAt: new Date(),
                    errorMessage: message,
                    payload: mergeSessionPayload(guestSession.payload, {
                      paymongoPaymentId: paymentId ?? '',
                      paymongoCheckoutSessionId: checkoutId,
                      paymongoSourceType: sourceType ?? '',
                      paymongoPaidAmountCents: paidAmount ?? 0,
                      paymongoNetAmountCents: netAmount ?? 0,
                      paymongoFeeCents:
                        asNumber(paymentAttributes?.fee) ?? 0,
                    }),
                  },
                });

                guestNotificationSessionId = guestSession.id;

                if (paymentId) {
                  automaticRefundSessionId = guestSession.id;
                  automaticRefundReason = message;
                  cleanupGuestSessionIds.add(guestSession.id);
                }
              } else if (
                guestSession.status === GuestPayMongoStatus.PENDING ||
                guestSession.status === GuestPayMongoStatus.FAILED
              ) {
                await tx.guestPayMongoSession.update({
                  where: { id: guestSession.id },
                  data: {
                    status: GuestPayMongoStatus.PAID,
                    paymongoPaymentId: paymentId,
                    paymentSourceType: sourceType,
                    paidAmountCents: paidAmount,
                    netAmountCents: netAmount,
                    feeCents: asNumber(paymentAttributes?.fee),
                    paidAt: new Date(),
                    errorMessage: null,
                    payload: mergeSessionPayload(guestSession.payload, {
                      paymongoPaymentId: paymentId ?? '',
                      paymongoCheckoutSessionId: checkoutId,
                      paymongoSourceType: sourceType ?? '',
                      paymongoPaidAmountCents: paidAmount ?? 0,
                      paymongoNetAmountCents: netAmount ?? 0,
                      paymongoFeeCents:
                        asNumber(paymentAttributes?.fee) ?? 0,
                    }),
                  },
                });

                guestNotificationSessionId = guestSession.id;
              }
            }
          } else {
            const posSessionId =
              metadata.pos_session_id ||
              metadata.posSessionId ||
              metadata.paymongo_session_id;

            const posSession = await findPosSessionForCheckout(tx, {
              candidateIds: [posSessionId, referenceNumber],
              checkoutSessionId: checkoutId,
            });

            if (!posSession) {
              /**
               * Critical behavior:
               * Do not acknowledge and permanently deduplicate a paid event
               * when the matching CloudView session is absent. Throwing rolls
               * back the webhook-event insert and returns a retryable response.
               *
               * The most common cause is that the guest checkout and webhook
               * are connected to different databases/deployments.
               */
              throw new Error(
                [
                  'No CloudView PayMongo session matched the paid checkout.',
                  `checkoutSessionId=${checkoutId}`,
                  `referenceNumber=${referenceNumber ?? 'missing'}`,
                  `flowType=${flowType || 'missing'}`,
                ].join(' ')
              );
            }

            if (posSession.checkoutSessionId !== checkoutId) {
              throw new Error(
                `POS checkout ID mismatch for session ${posSession.id}.`
              );
            }

            if (posSession.status !== POSPayMongoStatus.COMPLETED) {
              const amountMatches =
                paidAmount === posSession.amountCents ||
                netAmount === posSession.amountCents;
              const currencyMatches =
                paidCurrency ===
                (posSession.currency || 'PHP').toUpperCase();

              if (!amountMatches || !currencyMatches) {
                await tx.posPayMongoSession.update({
                  where: { id: posSession.id },
                  data: {
                    status: POSPayMongoStatus.PAID_REVIEW_REQUIRED,
                    paymongoPaymentId: paymentId,
                    paidAt: new Date(),
                    errorMessage:
                      'PayMongo amount or currency mismatch.',
                  },
                });

                posNotificationSessionId = posSession.id;
              } else if (
                posSession.status === POSPayMongoStatus.PENDING ||
                posSession.status === POSPayMongoStatus.FAILED
              ) {
                await tx.posPayMongoSession.update({
                  where: { id: posSession.id },
                  data: {
                    status: POSPayMongoStatus.PAID,
                    paymongoPaymentId: paymentId,
                    paidAt: new Date(),
                    errorMessage: null,
                    payload: mergeSessionPayload(posSession.payload, {
                      paymongoSourceType: sourceType ?? '',
                      paymongoPaymentId: paymentId ?? '',
                      paymongoCheckoutSessionId: checkoutId,
                      paymongoPaidAmountCents: paidAmount ?? 0,
                      paymongoNetAmountCents: netAmount ?? 0,
                      paymongoFeeCents:
                        asNumber(paymentAttributes?.fee) ?? 0,
                    }),
                  },
                });

                posNotificationSessionId = posSession.id;
              }
            }
          }
        } else if (
          eventType === 'payment.refunded' ||
          eventType === 'payment.refund.updated'
        ) {
          const refund = getRefundEventDetails(
            eventType,
            details.resource
          );

          const updatedRefund = await applyGuestRefundWebhookUpdateTx(tx, {
            refundId: refund.refundId,
            paymentId: refund.paymentId,
            amountCents: refund.amount,
            status: refund.status,
          });

          refundNotificationId = updatedRefund?.id ?? null;
        } else if (eventType === 'payment.failed') {
          const attributes = getAttributes(details.resource);
          const metadata = getMetadata(attributes);
          const guestPaymentSessionId =
            metadata.guest_payment_session_id ||
            metadata.guest_paymongo_session_id;

          if (guestPaymentSessionId) {
            cleanupGuestSessionIds.add(guestPaymentSessionId);

            const failedUpdate =
              await tx.guestPayMongoSession.updateMany({
                where: {
                  id: guestPaymentSessionId,
                  status: GuestPayMongoStatus.PENDING,
                },
                data: {
                  status: GuestPayMongoStatus.FAILED,
                  errorMessage:
                    'PayMongo reported that the payment attempt failed. The guest may create a new checkout.',
                },
              });

            if (failedUpdate.count > 0) {
              guestNotificationSessionId = guestPaymentSessionId;
            }
          }
        }

        if (existingWebhookEvent) {
          await tx.payMongoWebhookEvent.update({
            where: { id: eventId },
            data: {
              type: eventType,
              livemode: details.livemode,
              processedAt: new Date(),
            },
          });
        } else {
          await tx.payMongoWebhookEvent.create({
            data: {
              id: eventId,
              type: eventType,
              livemode: details.livemode,
            },
          });
        }
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      }
    );
  } catch (error) {
    console.error('[PayMongo webhook] Processing failed.', {
      eventId,
      eventType,
      message: getErrorMessage(error),
    });

    /**
     * A non-2xx response tells PayMongo the event was not safely handled.
     * Because the transaction rolled back, a retry or manual resend can
     * process the event later after the database/configuration is corrected.
     */
    return NextResponse.json(
      {
        ok: false,
        retryable: true,
        eventId,
        eventType,
        error: 'Webhook processing failed. Check the CloudView server logs.',
      },
      { status: 503 }
    );
  }

  await Promise.allSettled([
    guestNotificationSessionId
      ? notifyGuestPayMongoStatus({
          sessionId: guestNotificationSessionId,
          eventId,
        })
      : Promise.resolve(null),
    posNotificationSessionId
      ? notifyPosPayMongoStatus({
          sessionId: posNotificationSessionId,
          eventId,
        })
      : Promise.resolve(null),
    refundNotificationId
      ? notifyGuestPayMongoRefundStatus({
          refundId: refundNotificationId,
          eventId,
        })
      : Promise.resolve(null),
  ]);

  if (automaticRefundSessionId) {
    await requestAutomaticGuestRefund({
      sessionId: automaticRefundSessionId,
      reason: automaticRefundReason || 'Payment validation failed.',
    }).catch((error) => {
      console.error('[PayMongo webhook] Automatic refund request failed.', {
        sessionId: automaticRefundSessionId,
        message: getErrorMessage(error),
      });
    });
  }

  for (const sessionId of cleanupGuestSessionIds) {
    try {
      const session = await db.guestPayMongoSession.findUnique({
        where: { id: sessionId },
        select: { flowType: true, payload: true },
      });

      if (
        session?.flowType === GuestPayMongoFlow.SERVICE_REQUEST &&
        session.payload &&
        typeof session.payload === 'object' &&
        !Array.isArray(session.payload)
      ) {
        const payload = session.payload as {
          stagedAttachments?: StagedServiceAttachment[];
        };

        if (Array.isArray(payload.stagedAttachments)) {
          await cleanupStagedGuestServiceAttachments(
            payload.stagedAttachments
          ).catch(() => undefined);
        }
      }
    } catch (error) {
      console.warn('[PayMongo webhook] Attachment cleanup failed.', {
        sessionId,
        message: getErrorMessage(error),
      });
    }
  }

  return NextResponse.json({ ok: true, eventId, eventType });
}
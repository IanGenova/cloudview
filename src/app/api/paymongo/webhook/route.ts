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
  data?: {
    id?: string;
    type?: string;
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
  const current = event.data;
  const legacy = event.data?.attributes;

  return {
    eventId: current?.id,
    eventType: current?.type ?? legacy?.type,
    livemode:
      typeof current?.livemode === 'boolean'
        ? current.livemode
        : Boolean(legacy?.livemode),
    resource: asRecord(current?.data ?? legacy?.data),
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
    return NextResponse.json({ ok: true, ignored: 'mode-mismatch' });
  }

  let automaticRefundSessionId: string | null = null;
  let automaticRefundReason = '';
  let guestNotificationSessionId: string | null = null;
  let posNotificationSessionId: string | null = null;
  let refundNotificationId: string | null = null;
  const cleanupGuestSessionIds = new Set<string>();

  await db.$transaction(async (tx) => {
    const duplicate = await tx.payMongoWebhookEvent.findUnique({
      where: { id: eventId },
      select: { id: true },
    });

    if (duplicate) return;

    if (eventType === 'checkout_session.payment.paid') {
      const checkout = details.resource;
      const checkoutId = asString(checkout?.id);
      const attributes = getAttributes(checkout);
      const metadata = getMetadata(attributes);
      const referenceNumber = asString(attributes?.reference_number);
      const flowType = (metadata.flow_type || '').toUpperCase();
      const guestPaymentSessionId =
        metadata.guest_payment_session_id ||
        metadata.guest_paymongo_session_id ||
        metadata.guest_stay_paymongo_session_id;
      const isGuestFlow =
        Boolean(guestPaymentSessionId) ||
        flowType === 'GUEST_FOOD_ORDER' ||
        flowType === 'GUEST_SERVICE_REQUEST' ||
        flowType === 'FOOD_ORDER' ||
        flowType === 'SERVICE_REQUEST';

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

      if (isGuestFlow) {
        const internalId = guestPaymentSessionId || referenceNumber;
        const session = internalId
          ? await tx.guestPayMongoSession.findUnique({
              where: { id: internalId },
            })
          : null;

        if (!session || !checkoutId) {
          console.warn('[PayMongo webhook] Guest payment session was not found.', {
            eventId,
            internalId,
            checkoutId,
          });
        } else if (session.checkoutSessionId !== checkoutId) {
          console.warn('[PayMongo webhook] Guest checkout ID mismatch.', {
            eventId,
            internalId,
            expected: session.checkoutSessionId,
            received: checkoutId,
          });
        } else if (
          session.status !== GuestPayMongoStatus.COMPLETED &&
          session.status !== GuestPayMongoStatus.REFUNDED
        ) {
          const amountMatches =
            paidAmount === session.amountCents ||
            netAmount === session.amountCents;
          const currencyMatches =
            paidCurrency === (session.currency || 'PHP').toUpperCase();
          const wasClosedBeforePayment =
            session.status === GuestPayMongoStatus.CANCELLED ||
            session.status === GuestPayMongoStatus.EXPIRED;

          if (!amountMatches || !currencyMatches || wasClosedBeforePayment) {
            const message = wasClosedBeforePayment
              ? `PayMongo reported a payment after the checkout was ${session.status.toLowerCase()}. An automatic refund is required.`
              : `PayMongo amount mismatch. Expected ${session.amountCents} ${session.currency}; received ${paidAmount ?? 'unknown'} ${paidCurrency}${
                  typeof netAmount === 'number' ? ` with net ${netAmount}.` : '.'
                }`;

            await tx.guestPayMongoSession.update({
              where: { id: session.id },
              data: {
                status: GuestPayMongoStatus.PAID_REVIEW_REQUIRED,
                paymongoPaymentId: paymentId,
                paymentSourceType: sourceType,
                paidAmountCents: paidAmount,
                netAmountCents: netAmount,
                feeCents: asNumber(paymentAttributes?.fee),
                paidAt: new Date(),
                errorMessage: message,
                payload: mergeSessionPayload(session.payload, {
                  paymongoPaymentId: paymentId ?? '',
                  paymongoCheckoutSessionId: checkoutId,
                  paymongoSourceType: sourceType ?? '',
                  paymongoPaidAmountCents: paidAmount ?? 0,
                  paymongoNetAmountCents: netAmount ?? 0,
                  paymongoFeeCents: asNumber(paymentAttributes?.fee) ?? 0,
                }),
              },
            });

            guestNotificationSessionId = session.id;

            if (paymentId) {
              automaticRefundSessionId = session.id;
              automaticRefundReason = message;
              cleanupGuestSessionIds.add(session.id);
            }
          } else if (
            session.status === GuestPayMongoStatus.PENDING ||
            session.status === GuestPayMongoStatus.FAILED
          ) {
            await tx.guestPayMongoSession.update({
              where: { id: session.id },
              data: {
                status: GuestPayMongoStatus.PAID,
                paymongoPaymentId: paymentId,
                paymentSourceType: sourceType,
                paidAmountCents: paidAmount,
                netAmountCents: netAmount,
                feeCents: asNumber(paymentAttributes?.fee),
                paidAt: new Date(),
                errorMessage: null,
                payload: mergeSessionPayload(session.payload, {
                  paymongoPaymentId: paymentId ?? '',
                  paymongoCheckoutSessionId: checkoutId,
                  paymongoSourceType: sourceType ?? '',
                  paymongoPaidAmountCents: paidAmount ?? 0,
                  paymongoNetAmountCents: netAmount ?? 0,
                  paymongoFeeCents: asNumber(paymentAttributes?.fee) ?? 0,
                }),
              },
            });

            guestNotificationSessionId = session.id;
          }
        }
      } else {
        const internalSessionId =
          metadata.pos_session_id ||
          metadata.posSessionId ||
          metadata.paymongo_session_id ||
          referenceNumber;
        const session = internalSessionId
          ? await tx.posPayMongoSession.findUnique({
              where: { id: internalSessionId },
            })
          : null;

        if (!session || !checkoutId) {
          console.warn('[PayMongo webhook] POS payment session was not found.', {
            eventId,
            internalSessionId,
            checkoutId,
          });
        } else if (session.checkoutSessionId !== checkoutId) {
          console.warn('[PayMongo webhook] POS checkout ID mismatch.', {
            eventId,
            internalSessionId,
          });
        } else if (session.status !== POSPayMongoStatus.COMPLETED) {
          const amountMatches =
            paidAmount === session.amountCents ||
            netAmount === session.amountCents;
          const currencyMatches =
            paidCurrency === (session.currency || 'PHP').toUpperCase();

          if (!amountMatches || !currencyMatches) {
            await tx.posPayMongoSession.update({
              where: { id: session.id },
              data: {
                status: POSPayMongoStatus.PAID_REVIEW_REQUIRED,
                paymongoPaymentId: paymentId,
                paidAt: new Date(),
                errorMessage: 'PayMongo amount or currency mismatch.',
              },
            });

            posNotificationSessionId = session.id;
          } else if (
            session.status === POSPayMongoStatus.PENDING ||
            session.status === POSPayMongoStatus.FAILED
          ) {
            await tx.posPayMongoSession.update({
              where: { id: session.id },
              data: {
                status: POSPayMongoStatus.PAID,
                paymongoPaymentId: paymentId,
                paidAt: new Date(),
                errorMessage: null,
                payload: mergeSessionPayload(session.payload, {
                  paymongoSourceType: sourceType ?? '',
                  paymongoPaymentId: paymentId ?? '',
                  paymongoCheckoutSessionId: checkoutId,
                  paymongoPaidAmountCents: paidAmount ?? 0,
                  paymongoNetAmountCents: netAmount ?? 0,
                  paymongoFeeCents: asNumber(paymentAttributes?.fee) ?? 0,
                }),
              },
            });

            posNotificationSessionId = session.id;
          }
        }
      }
    } else if (
      eventType === 'payment.refunded' ||
      eventType === 'payment.refund.updated'
    ) {
      const refund = getRefundEventDetails(eventType, details.resource);

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

        const failedUpdate = await tx.guestPayMongoSession.updateMany({
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

    await tx.payMongoWebhookEvent.create({
      data: {
        id: eventId,
        type: eventType,
        livemode: details.livemode,
      },
    });
  });

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
    });
  }

  for (const sessionId of cleanupGuestSessionIds) {
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
  }

  return NextResponse.json({ ok: true });
}
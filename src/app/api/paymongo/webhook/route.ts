import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { POSPayMongoStatus } from '@prisma/client';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PayMongoPayment = {
  id?: string;
  attributes?: {
    amount?: number;
    net_amount?: number;
    fee?: number;
    currency?: string;
    status?: string;
  };
};

type CheckoutAttributes = {
  metadata?: Record<string, string>;
  reference_number?: string;
  payments?: PayMongoPayment[];
  payment_intent?: {
    id?: string;
    attributes?: {
      amount?: number;
      currency?: string;
      status?: string;
      payments?: PayMongoPayment[];
    };
  };
};

type CheckoutResource = {
  id?: string;
  type?: string;
  attributes?: CheckoutAttributes;
};

/**
 * Supports both the current PayMongo webhook envelope and the older
 * data.attributes envelope so existing test/live integrations remain safe.
 */
type PayMongoEvent = {
  event_type?: string;
  data?: {
    // Current envelope
    type?: string;
    resource?: string;
    livemode?: boolean;
    organization_id?: string;
    created_at?: string;
    updated_at?: string;
    data?: CheckoutResource;

    // Older envelope compatibility
    id?: string;
    attributes?: {
      type?: string;
      livemode?: boolean;
      data?: CheckoutResource;
    };
  };
};

type ParsedSignatureHeader = {
  timestamp?: string;
  testSignature?: string;
  liveSignature?: string;
};

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

    if (separatorIndex <= 0) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();

    values.set(key, value);
  }

  return {
    timestamp: values.get('t'),
    testSignature: values.get('te'),
    liveSignature: values.get('li'),
  };
}

function verifySignature({
  rawBody,
  signatureHeader,
  secret,
  expectedLivemode,
}: {
  rawBody: string;
  signatureHeader: string;
  secret: string;
  expectedLivemode: boolean;
}) {
  const parsed = parseSignatureHeader(signatureHeader);

  /**
   * Current PayMongo format:
   * t=<timestamp>,te=<test signature>,li=<live signature>
   *
   * Signed payload:
   * <timestamp>.<raw request body>
   */
  if (parsed.timestamp) {
    const suppliedSignature = expectedLivemode
      ? parsed.liveSignature
      : parsed.testSignature;

    if (!suppliedSignature) {
      return false;
    }

    const signedPayload = `${parsed.timestamp}.${rawBody}`;
    const expectedSignature = createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    return safeHexEqual(expectedSignature, suppliedSignature);
  }

  /**
   * Compatibility fallback for older/plain signature headers.
   */
  const expectedSignature = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return safeHexEqual(expectedSignature, signatureHeader);
}

function getEventDetails(event: PayMongoEvent) {
  const currentEnvelope = event.data;
  const legacyEnvelope = event.data?.attributes;

  return {
    eventType: currentEnvelope?.type ?? legacyEnvelope?.type,
    livemode:
      typeof currentEnvelope?.livemode === 'boolean'
        ? currentEnvelope.livemode
        : Boolean(legacyEnvelope?.livemode),
    checkout: currentEnvelope?.data ?? legacyEnvelope?.data,
    suppliedEventId: currentEnvelope?.id,
  };
}

function getPaidPayment(attributes?: CheckoutAttributes) {
  const payments = [
    ...(attributes?.payments ?? []),
    ...(attributes?.payment_intent?.attributes?.payments ?? []),
  ];

  return (
    payments.find((payment) => payment.attributes?.status === 'paid') ??
    payments[0]
  );
}

function createDeterministicEventId(
  rawBody: string,
  suppliedEventId?: string
) {
  if (suppliedEventId) {
    return suppliedEventId;
  }

  return `pmw_${createHash('sha256').update(rawBody).digest('hex')}`;
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
    console.warn('[PayMongo webhook] Signature verification failed.');

    return NextResponse.json(
      { ok: false, error: 'Invalid signature.' },
      { status: 401 }
    );
  }

  let event: PayMongoEvent;

  try {
    event = JSON.parse(rawBody) as PayMongoEvent;
  } catch {
    console.warn('[PayMongo webhook] Invalid JSON payload.');

    return NextResponse.json(
      { ok: false, error: 'Invalid JSON.' },
      { status: 400 }
    );
  }

  const {
    eventType,
    livemode,
    checkout,
    suppliedEventId,
  } = getEventDetails(event);

  const eventId = createDeterministicEventId(rawBody, suppliedEventId);

  if (!eventType) {
    console.info('[PayMongo webhook] Ignored event with no type.', {
      eventId,
    });

    return NextResponse.json({ ok: true, ignored: 'missing-event-type' });
  }

  if (livemode !== expectedLivemode) {
    console.info('[PayMongo webhook] Ignored mode mismatch.', {
      eventId,
      eventType,
      receivedLivemode: livemode,
      expectedLivemode,
    });

    return NextResponse.json({ ok: true, ignored: 'mode-mismatch' });
  }

  await db.$transaction(async (tx) => {
    const duplicate = await tx.payMongoWebhookEvent.findUnique({
      where: {
        id: eventId,
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      console.info('[PayMongo webhook] Duplicate event ignored.', {
        eventId,
        eventType,
      });

      return;
    }

    if (eventType === 'checkout_session.payment.paid') {
      const checkoutId = checkout?.id;
      const attributes = checkout?.attributes;
      const metadata = attributes?.metadata ?? {};

      const internalSessionId =
        metadata.pos_session_id ||
        metadata.posSessionId ||
        attributes?.reference_number;

      if (!internalSessionId || !checkoutId) {
        console.warn(
          '[PayMongo webhook] Paid checkout is missing the internal or checkout session ID.',
          {
            eventId,
            checkoutId: checkoutId ?? null,
          }
        );
      } else {
        const session = await tx.posPayMongoSession.findUnique({
          where: {
            id: internalSessionId,
          },
        });

        if (!session) {
          console.warn(
            '[PayMongo webhook] No local POS PayMongo session found.',
            {
              eventId,
              internalSessionId,
              checkoutId,
            }
          );
        } else if (session.checkoutSessionId !== checkoutId) {
          console.warn(
            '[PayMongo webhook] Checkout session ID does not match.',
            {
              eventId,
              internalSessionId,
              expectedCheckoutId: session.checkoutSessionId,
              receivedCheckoutId: checkoutId,
            }
          );
        } else if (session.status !== POSPayMongoStatus.COMPLETED) {
          const payment = getPaidPayment(attributes);
          const paymentAttributes = payment?.attributes;

          const paidAmount =
            paymentAttributes?.amount ??
            attributes?.payment_intent?.attributes?.amount;

          const netAmount = paymentAttributes?.net_amount;

          const paidCurrency = (
            paymentAttributes?.currency ??
            attributes?.payment_intent?.attributes?.currency ??
            'PHP'
          ).toUpperCase();

          const expectedCurrency = (session.currency || 'PHP').toUpperCase();

          /**
           * When pass_on_fees is enabled, payment.amount may include the fee
           * while payment.net_amount matches the merchant's original total.
           * Accept either amount when comparing against the local POS total.
           */
          const amountMatches =
            typeof paidAmount !== 'number' ||
            paidAmount === session.amountCents ||
            netAmount === session.amountCents;

          const currencyMatches = paidCurrency === expectedCurrency;

          if (!amountMatches || !currencyMatches) {
            await tx.posPayMongoSession.update({
              where: {
                id: session.id,
              },
              data: {
                status: POSPayMongoStatus.PAID_REVIEW_REQUIRED,
                paymongoPaymentId: payment?.id,
                paidAt: new Date(),
                errorMessage:
                  `PayMongo amount mismatch. Expected ` +
                  `${session.amountCents} ${expectedCurrency}; received ` +
                  `${paidAmount ?? 'unknown'} ${paidCurrency}` +
                  (typeof netAmount === 'number'
                    ? ` with net amount ${netAmount}.`
                    : '.'),
              },
            });

            console.warn(
              '[PayMongo webhook] Payment requires manual review.',
              {
                eventId,
                internalSessionId,
                checkoutId,
                expectedAmount: session.amountCents,
                receivedAmount: paidAmount ?? null,
                receivedNetAmount: netAmount ?? null,
                expectedCurrency,
                receivedCurrency: paidCurrency,
              }
            );
          } else if (
            session.status === POSPayMongoStatus.PENDING ||
            session.status === POSPayMongoStatus.FAILED
          ) {
            await tx.posPayMongoSession.update({
              where: {
                id: session.id,
              },
              data: {
                status: POSPayMongoStatus.PAID,
                paymongoPaymentId: payment?.id,
                paidAt: new Date(),
                errorMessage: null,
              },
            });

            console.info('[PayMongo webhook] POS payment marked as paid.', {
              eventId,
              internalSessionId,
              checkoutId,
              paymentId: payment?.id ?? null,
            });
          }
        }
      }
    } else {
      console.info('[PayMongo webhook] Event acknowledged but not handled.', {
        eventId,
        eventType,
      });
    }

    await tx.payMongoWebhookEvent.create({
      data: {
        id: eventId,
        type: eventType,
        livemode,
      },
    });
  });

  return NextResponse.json({ ok: true });
}

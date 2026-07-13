import 'server-only';

import type { XenditSplitPayment } from '@/lib/xendit-split';

const XENDIT_API_BASE = 'https://api.xendit.co';
const XENDIT_REQUEST_TIMEOUT_MS = 25_000;

export type XenditPaymentMethod =
  | 'CARDS'
  | 'GCASH'
  | 'QRPH'
  | 'SHOPEEPAY'
  | 'GRABPAY'
  | 'PAYMAYA';

export type XenditRefundReason =
  | 'FRAUDULENT'
  | 'DUPLICATE'
  | 'REQUESTED_BY_CUSTOMER'
  | 'CANCELLATION'
  | 'OTHERS';

const SUPPORTED_PAYMENT_METHODS = new Set<XenditPaymentMethod>([
  'CARDS',
  'GCASH',
  'QRPH',
  'SHOPEEPAY',
  'GRABPAY',
  'PAYMAYA',
]);

export type XenditLineItem = {
  name: string;
  amount: number; // CloudView stores centavos.
  currency: 'PHP';
  quantity: number;
  description?: string;
  images?: string[];
};

type XenditErrorBody = {
  error_code?: string;
  message?: string;
  errors?: Array<{ message?: string; path?: string }> | string[];
};

type XenditSessionResponse = {
  payment_session_id?: string;
  reference_id?: string;
  status?: string;
  payment_link_url?: string | null;
  payment_id?: string | null;
  payment_request_id?: string | null;
  business_id?: string;
  expires_at?: string;
};

type XenditRefundResponse = {
  id?: string;
  payment_id?: string | null;
  payment_request_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  reference_id?: string;
};

function getSecretKey() {
  const key = process.env.XENDIT_SECRET_KEY?.trim();

  if (!key) {
    throw new Error('XENDIT_SECRET_KEY is not configured.');
  }

  if (!key.startsWith('xnd_')) {
    throw new Error('XENDIT_SECRET_KEY must be a valid Xendit API key beginning with xnd_.');
  }

  const expectedLivemode = process.env.XENDIT_LIVEMODE === 'true';

  if (expectedLivemode && key.startsWith('xnd_development_')) {
    throw new Error('XENDIT_LIVEMODE is true, but a development API key is configured.');
  }

  if (!expectedLivemode && key.startsWith('xnd_production_')) {
    throw new Error('XENDIT_LIVEMODE is false, but a production API key is configured.');
  }

  return key;
}

function getBasicAuthorization() {
  return `Basic ${Buffer.from(`${getSecretKey()}:`).toString('base64')}`;
}

function parseJsonSafely(value: string): unknown {
  if (!value) return null;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function getXenditErrorMessage(input: {
  endpoint: string;
  status: number;
  statusText: string;
  rawBody: string;
  parsedBody: unknown;
}) {
  const parsed = input.parsedBody as XenditErrorBody | null;
  const details = Array.isArray(parsed?.errors)
    ? parsed.errors
        .slice(0, 3)
        .map((entry) =>
          typeof entry === 'string'
            ? entry
            : `${entry.message || 'Invalid request'}${entry.path ? ` (${entry.path})` : ''}`
        )
        .join('; ')
    : '';

  const errorCode = parsed?.error_code;
  const message = parsed?.message;

  if (message || errorCode || details) {
    return `Xendit ${input.status}: ${[errorCode, message, details]
      .filter(Boolean)
      .join(' — ')}`;
  }

  const compactBody = input.rawBody.replace(/\s+/g, ' ').trim().slice(0, 500);

  return compactBody
    ? `Xendit ${input.status} from ${input.endpoint}: ${compactBody}`
    : `Xendit ${input.status} ${input.statusText || 'request failed'} from ${input.endpoint}.`;
}

async function xenditFetch(input: {
  endpoint: string;
  method: 'POST' | 'GET';
  body?: unknown;
  idempotencyKey?: string;
  forUserId?: string | null;
  splitRuleId?: string | null;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), XENDIT_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(input.endpoint, {
      method: input.method,
      headers: {
        Accept: 'application/json',
        Authorization: getBasicAuthorization(),
        ...(input.body ? { 'Content-Type': 'application/json' } : {}),
        ...(input.idempotencyKey
          ? { 'Idempotency-Key': input.idempotencyKey.slice(0, 255) }
          : {}),
        ...(input.forUserId ? { 'for-user-id': input.forUserId } : {}),
        ...(input.splitRuleId ? { 'with-split-rule': input.splitRuleId } : {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      cache: 'no-store',
      signal: controller.signal,
    });

    const rawBody = await response.text();
    const parsedBody = parseJsonSafely(rawBody);

    if (!response.ok) {
      throw new Error(
        getXenditErrorMessage({
          endpoint: input.endpoint,
          status: response.status,
          statusText: response.statusText,
          rawBody,
          parsedBody,
        })
      );
    }

    return { response, rawBody, parsedBody };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Xendit request timed out after ${XENDIT_REQUEST_TIMEOUT_MS / 1000} seconds.`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isPrivateRedirectHostname(hostname: string) {
  const host = hostname.trim().toLowerCase();

  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.localhost')
  ) {
    return true;
  }

  if (/^10\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.(?:\d{1,3}\.)\d{1,3}$/.test(host)) return true;

  const private172 = host.match(/^172\.(\d{1,3})\.(?:\d{1,3})\.(?:\d{1,3})$/);
  if (!private172) return false;

  const secondOctet = Number(private172[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

function requireAbsoluteRedirectUrl(value: string, label: string) {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} must be an absolute URL.`);
  }

  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error(`${label} must use HTTP or HTTPS.`);
  }

  if (
    process.env.NODE_ENV === 'production' &&
    url.protocol !== 'https:' &&
    !isPrivateRedirectHostname(url.hostname)
  ) {
    throw new Error(`${label} must use HTTPS outside localhost/private LAN testing.`);
  }

  return url.toString();
}

function centsToPhp(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error('CloudView amount must be a non-negative integer number of centavos.');
  }

  return Number((cents / 100).toFixed(2));
}

export function xenditAmountToCents(value: unknown) {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function normalizeMetadata(metadata: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(metadata)
      .slice(0, 50)
      .map(([key, value]) => [key.trim().slice(0, 40), String(value).slice(0, 80)])
      .filter(([key]) => Boolean(key))
  );
}

function normalizeLineItems(lineItems: XenditLineItem[]) {
  if (!lineItems.length) {
    throw new Error('Xendit checkout requires at least one line item.');
  }

  return lineItems.map((item, index) => {
    const name = item.name.trim().slice(0, 255);
    const description = item.description?.trim().slice(0, 255);
    const amount = Number(item.amount);
    const quantity = Number(item.quantity);

    if (!name) throw new Error(`Xendit line item ${index + 1} has no name.`);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error(`Xendit line item ${index + 1} has an invalid amount.`);
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new Error(`Xendit line item ${index + 1} has an invalid quantity.`);
    }

    const imageUrl = item.images
      ?.map((value) => value.trim())
      .find((value) => {
        try {
          return ['https:', 'http:'].includes(new URL(value).protocol);
        } catch {
          return false;
        }
      });

    const isFee = /^(tax|service charge|fee)/i.test(name);

    return {
      reference_id: `item_${index + 1}`,
      name,
      description: description || name,
      type: isFee ? ('FEE' as const) : ('PHYSICAL_SERVICE' as const),
      category: isFee ? 'HOTEL_FEES' : 'HOTEL_HOSPITALITY',
      net_unit_amount: centsToPhp(amount),
      quantity,
      currency: 'PHP' as const,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    };
  });
}

function normalizePaymentMethods(values: string[] | undefined, envName: string) {
  if (!values?.length) return [] as XenditPaymentMethod[];

  const methods = Array.from(
    new Set(values.map((item) => item.trim().toUpperCase()).filter(Boolean))
  );
  const unsupported = methods.filter(
    (method) => !SUPPORTED_PAYMENT_METHODS.has(method as XenditPaymentMethod)
  );

  if (unsupported.length) {
    throw new Error(
      `Unsupported ${envName} value: ${unsupported.join(', ')}. Allowed values are ${Array.from(
        SUPPORTED_PAYMENT_METHODS
      ).join(', ')}.`
    );
  }

  return methods as XenditPaymentMethod[];
}

export function getXenditPaymentMethods() {
  return normalizePaymentMethods(
    process.env.XENDIT_PAYMENT_METHODS?.split(','),
    'XENDIT_PAYMENT_METHODS'
  );
}

export function getXenditGuestPaymentMethods() {
  return normalizePaymentMethods(
    process.env.XENDIT_GUEST_PAYMENT_METHODS?.split(','),
    'XENDIT_GUEST_PAYMENT_METHODS'
  );
}

export async function createXenditCheckoutSession(input: {
  idempotencyKey: string;
  lineItems: XenditLineItem[];
  successUrl: string;
  cancelUrl: string;
  description: string;
  referenceNumber: string;
  metadata: Record<string, string>;
  paymentMethods?: XenditPaymentMethod[];
  splitPayment?: XenditSplitPayment | null;
  expiresAt?: Date;
}) {
  const idempotencyKey = input.idempotencyKey.trim();
  const referenceNumber = input.referenceNumber.trim().slice(0, 64);

  if (!idempotencyKey) throw new Error('Xendit idempotency key is required.');
  if (!referenceNumber) throw new Error('Xendit reference number is required.');

  const lineItems = normalizeLineItems(input.lineItems);
  const totalCents = input.lineItems.reduce(
    (sum, item) => sum + item.amount * item.quantity,
    0
  );
  const paymentMethods = input.paymentMethods?.length
    ? normalizePaymentMethods(input.paymentMethods, 'paymentMethods')
    : getXenditPaymentMethods();

  const expiresAt = input.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000);
  if (expiresAt.getTime() < Date.now() + 10 * 60 * 1000) {
    throw new Error('Xendit checkout expiration must be at least 10 minutes in the future.');
  }

  const body = {
    reference_id: referenceNumber,
    session_type: 'PAY',
    mode: 'PAYMENT_LINK',
    amount: centsToPhp(totalCents),
    currency: 'PHP',
    country: 'PH',
    capture_method: 'AUTOMATIC',
    locale: 'en',
    description: input.description.trim().slice(0, 1000) || 'CloudView payment',
    success_return_url: requireAbsoluteRedirectUrl(input.successUrl, 'Xendit success URL'),
    cancel_return_url: requireAbsoluteRedirectUrl(input.cancelUrl, 'Xendit cancel URL'),
    expires_at: expiresAt.toISOString(),
    metadata: normalizeMetadata(input.metadata),
    items: lineItems,
    ...(paymentMethods.length ? { allowed_payment_channels: paymentMethods } : {}),
  };

  const result = await xenditFetch({
    endpoint: `${XENDIT_API_BASE}/sessions`,
    method: 'POST',
    idempotencyKey,
    body,
    forUserId: input.splitPayment?.forUserId,
    splitRuleId: input.splitPayment?.splitRuleId,
  });

  const session = result.parsedBody as XenditSessionResponse | null;

  if (!session?.payment_session_id || !session.payment_link_url) {
    throw new Error('Xendit did not return a valid Payment Session or payment link URL.');
  }

  return {
    id: session.payment_session_id,
    checkoutUrl: session.payment_link_url,
    paymentRequestId: session.payment_request_id ?? null,
    businessId: session.business_id ?? null,
    expiresAt: session.expires_at ?? expiresAt.toISOString(),
  };
}

export async function expireXenditCheckoutSession(
  checkoutSessionIdInput: string,
  forUserId?: string | null
) {
  const checkoutSessionId = checkoutSessionIdInput.trim();

  if (!/^ps-[A-Za-z0-9]+$/.test(checkoutSessionId)) {
    throw new Error('A valid Xendit Payment Session ID is required.');
  }

  const result = await xenditFetch({
    endpoint: `${XENDIT_API_BASE}/sessions/${encodeURIComponent(checkoutSessionId)}/cancel`,
    method: 'POST',
    forUserId,
  });
  const session = result.parsedBody as XenditSessionResponse | null;

  if (!session?.payment_session_id) {
    throw new Error('Xendit did not return a canceled Payment Session.');
  }

  return { id: session.payment_session_id, status: session.status ?? 'CANCELED' };
}

export async function createXenditRefund(input: {
  idempotencyKey: string;
  paymentRequestId: string;
  amount: number; // centavos
  reason?: XenditRefundReason;
  notes?: string;
  metadata?: Record<string, string>;
  forUserId?: string | null;
}) {
  const idempotencyKey = input.idempotencyKey.trim();
  const paymentRequestId = input.paymentRequestId.trim();
  const amount = Number(input.amount);

  if (!idempotencyKey) throw new Error('Xendit refund idempotency key is required.');
  if (!/^pr-[A-Za-z0-9-]+$/.test(paymentRequestId)) {
    throw new Error('A valid Xendit payment request ID is required for a refund.');
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Xendit refund amount must be a positive integer number of centavos.');
  }

  const result = await xenditFetch({
    endpoint: `${XENDIT_API_BASE}/refunds`,
    method: 'POST',
    idempotencyKey,
    forUserId: input.forUserId,
    body: {
      reference_id: idempotencyKey.slice(0, 255),
      payment_request_id: paymentRequestId,
      currency: 'PHP',
      amount: centsToPhp(amount),
      reason: input.reason ?? 'OTHERS',
      metadata: normalizeMetadata({
        ...(input.metadata ?? {}),
        notes: (input.notes || 'Automatic CloudView refund').slice(0, 80),
      }),
    },
  });

  const refund = result.parsedBody as XenditRefundResponse | null;

  if (!refund?.id || !refund.status) {
    throw new Error('Xendit did not return a valid refund response.');
  }

  return {
    id: refund.id,
    status: refund.status.toLowerCase(),
    amount: xenditAmountToCents(refund.amount) ?? amount,
    paymentId: refund.payment_id ?? null,
    paymentRequestId: refund.payment_request_id ?? paymentRequestId,
  };
}
import 'server-only';

const PAYMONGO_API_BASE = 'https://api.paymongo.com';
const PAYMONGO_REQUEST_TIMEOUT_MS = 25_000;

export type PayMongoPaymentMethod = 'card' | 'gcash' | 'qrph';
export type PayMongoRefundReason =
  | 'duplicate'
  | 'fraudulent'
  | 'others';

const SUPPORTED_PAYMENT_METHODS = new Set<PayMongoPaymentMethod>([
  'card',
  'gcash',
  'qrph',
]);

export type PayMongoLineItem = {
  name: string;
  amount: number;
  currency: 'PHP';
  quantity: number;
  description?: string;
  images?: string[];
};

type PayMongoResource<TAttributes> = {
  data: {
    id: string;
    type: string;
    attributes: TAttributes;
  };
};

type CheckoutAttributes = {
  checkout_url: string;
  reference_number?: string | null;
  status?: string;
  metadata?: Record<string, string>;
};

type RefundAttributes = {
  amount: number;
  currency?: string;
  payment_id: string;
  reason?: string;
  notes?: string | null;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  metadata?: Record<string, string>;
};

type PayMongoErrorBody = {
  errors?: Array<{
    code?: string;
    detail?: string;
    source?: {
      pointer?: string;
    };
  }>;
};

function getSecretKey() {
  const key = process.env.PAYMONGO_SECRET_KEY?.trim();

  if (!key) {
    throw new Error('PAYMONGO_SECRET_KEY is not configured.');
  }

  if (!key.startsWith('sk_test_') && !key.startsWith('sk_live_')) {
    throw new Error(
      'PAYMONGO_SECRET_KEY must begin with sk_test_ or sk_live_.'
    );
  }

  const expectedLivemode = process.env.PAYMONGO_LIVEMODE === 'true';

  if (expectedLivemode && !key.startsWith('sk_live_')) {
    throw new Error(
      'PAYMONGO_LIVEMODE is true, but PAYMONGO_SECRET_KEY is not a live key.'
    );
  }

  if (!expectedLivemode && !key.startsWith('sk_test_')) {
    throw new Error(
      'PAYMONGO_LIVEMODE is false, but PAYMONGO_SECRET_KEY is not a test key.'
    );
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

function getPayMongoErrorMessage(input: {
  endpoint: string;
  status: number;
  statusText: string;
  rawBody: string;
  parsedBody: unknown;
}) {
  const parsed = input.parsedBody as PayMongoErrorBody | null;
  const errors = parsed?.errors ?? [];

  if (errors.length) {
    const details = errors
      .slice(0, 3)
      .map((error) => {
        const pointer = error.source?.pointer
          ? ` (${error.source.pointer})`
          : '';

        return `${error.detail || error.code || 'Invalid request'}${pointer}`;
      })
      .join('; ');

    return `PayMongo ${input.status}: ${details}`;
  }

  const compactBody = input.rawBody.replace(/\s+/g, ' ').trim().slice(0, 500);

  if (compactBody) {
    return `PayMongo ${input.status} from ${input.endpoint}: ${compactBody}`;
  }

  return `PayMongo ${input.status} ${
    input.statusText || 'request failed'
  } from ${input.endpoint}.`;
}

async function payMongoFetch(input: {
  endpoint: string;
  method: 'POST' | 'GET';
  body?: unknown;
  idempotencyKey?: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    PAYMONGO_REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(input.endpoint, {
      method: input.method,
      headers: {
        Accept: 'application/json',
        Authorization: getBasicAuthorization(),
        ...(input.body ? { 'Content-Type': 'application/json' } : {}),
        ...(input.idempotencyKey
          ? { 'Idempotency-Key': input.idempotencyKey }
          : {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      cache: 'no-store',
      signal: controller.signal,
    });

    const rawBody = await response.text();
    const parsedBody = parseJsonSafely(rawBody);

    if (!response.ok) {
      throw new Error(
        getPayMongoErrorMessage({
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
        `PayMongo request timed out after ${
          PAYMONGO_REQUEST_TIMEOUT_MS / 1000
        } seconds.`
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

  if (/^10\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host)) {
    return true;
  }

  if (/^192\.168\.(?:\d{1,3}\.)\d{1,3}$/.test(host)) {
    return true;
  }

  const private172 = host.match(
    /^172\.(\d{1,3})\.(?:\d{1,3})\.(?:\d{1,3})$/
  );

  if (private172) {
    const secondOctet = Number(private172[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
}

function requireAbsoluteRedirectUrl(value: string, label: string) {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} must be an absolute URL.`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${label} must use HTTP or HTTPS.`);
  }

  /**
   * Public production redirects must use HTTPS.
   * Private LAN and localhost HTTP URLs remain allowed for local development
   * and for testing a production build on the hotel network.
   */
  if (
    process.env.NODE_ENV === 'production' &&
    url.protocol !== 'https:' &&
    !isPrivateRedirectHostname(url.hostname)
  ) {
    throw new Error(
      `${label} must use HTTPS unless it points to localhost or a private LAN address.`
    );
  }

  return url.toString();
}

function normalizeImageUrls(images?: string[]) {
  if (!images?.length) return undefined;

  const validImages = images
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      try {
        const url = new URL(value);
        return url.protocol === 'https:';
      } catch {
        return false;
      }
    })
    .slice(0, 3);

  return validImages.length ? validImages : undefined;
}

function normalizeLineItems(lineItems: PayMongoLineItem[]) {
  if (!lineItems.length) {
    throw new Error('PayMongo checkout requires at least one line item.');
  }

  return lineItems.map((item, index) => {
    const name = item.name.trim().slice(0, 120);
    const description = item.description?.trim().slice(0, 255);
    const amount = Number(item.amount);
    const quantity = Number(item.quantity);

    if (!name) {
      throw new Error(`PayMongo line item ${index + 1} has no name.`);
    }

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error(`PayMongo line item ${index + 1} has an invalid amount.`);
    }

    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new Error(`PayMongo line item ${index + 1} has an invalid quantity.`);
    }

    const images = normalizeImageUrls(item.images);

    return {
      name,
      amount,
      currency: 'PHP' as const,
      quantity,
      ...(description ? { description } : {}),
      ...(images ? { images } : {}),
    };
  });
}

function normalizePaymentMethods(
  values: string[] | undefined,
  envName: string
): PayMongoPaymentMethod[] {
  const methods = values?.length
    ? Array.from(new Set(values.map((item) => item.trim().toLowerCase())))
    : ['card', 'gcash', 'qrph'];

  const unsupported = methods.filter(
    (method) => !SUPPORTED_PAYMENT_METHODS.has(method as PayMongoPaymentMethod)
  );

  if (unsupported.length) {
    throw new Error(
      `Unsupported ${envName} value: ${unsupported.join(
        ', '
      )}. Allowed values are card, gcash, and qrph.`
    );
  }

  return methods as PayMongoPaymentMethod[];
}

export function getPayMongoPaymentMethods() {
  const configured = process.env.PAYMONGO_PAYMENT_METHODS?.split(',').filter(
    Boolean
  );

  return normalizePaymentMethods(configured, 'PAYMONGO_PAYMENT_METHODS');
}

export function getPayMongoGuestPaymentMethods() {
  const configured = process.env.PAYMONGO_GUEST_PAYMENT_METHODS?.split(',').filter(
    Boolean
  );

  return normalizePaymentMethods(
    configured?.length ? configured : ['qrph'],
    'PAYMONGO_GUEST_PAYMENT_METHODS'
  );
}

export async function createPayMongoCheckoutSession(input: {
  idempotencyKey: string;
  lineItems: PayMongoLineItem[];
  successUrl: string;
  cancelUrl: string;
  description: string;
  referenceNumber: string;
  metadata: Record<string, string>;
  paymentMethods?: PayMongoPaymentMethod[];
}) {
  const idempotencyKey = input.idempotencyKey.trim();
  const referenceNumber = input.referenceNumber.trim();

  if (!idempotencyKey) {
    throw new Error('PayMongo idempotency key is required.');
  }

  if (!referenceNumber) {
    throw new Error('PayMongo reference number is required.');
  }

  const lineItems = normalizeLineItems(input.lineItems);
  const successUrl = requireAbsoluteRedirectUrl(
    input.successUrl,
    'PayMongo success URL'
  );
  const cancelUrl = requireAbsoluteRedirectUrl(
    input.cancelUrl,
    'PayMongo cancel URL'
  );
  const paymentMethods = input.paymentMethods?.length
    ? normalizePaymentMethods(input.paymentMethods, 'paymentMethods')
    : getPayMongoPaymentMethods();

  const body = {
    data: {
      attributes: {
        line_items: lineItems,
        payment_method_types: paymentMethods,
        success_url: successUrl,
        cancel_url: cancelUrl,
        description: input.description.trim().slice(0, 255),
        reference_number: referenceNumber.slice(0, 255),
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        metadata: input.metadata,
      },
    },
  };

  let endpoint = `${PAYMONGO_API_BASE}/v2/checkout_sessions`;
  let result: Awaited<ReturnType<typeof payMongoFetch>>;

  try {
    result = await payMongoFetch({
      endpoint,
      method: 'POST',
      idempotencyKey,
      body,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (!message.startsWith('PayMongo 404')) {
      throw error;
    }

    endpoint = `${PAYMONGO_API_BASE}/v1/checkout_sessions`;
    console.warn('[PayMongo] V2 checkout endpoint returned 404. Retrying V1.');
    result = await payMongoFetch({
      endpoint,
      method: 'POST',
      idempotencyKey,
      body,
    });
  }

  const resource = result.parsedBody as PayMongoResource<CheckoutAttributes> | null;

  if (!resource?.data?.id || !resource.data.attributes?.checkout_url) {
    throw new Error(
      'PayMongo did not return a valid checkout session or checkout URL.'
    );
  }

  return {
    id: resource.data.id,
    checkoutUrl: resource.data.attributes.checkout_url,
  };
}

export async function expirePayMongoCheckoutSession(
  checkoutSessionIdInput: string
) {
  const checkoutSessionId = checkoutSessionIdInput.trim();

  if (!checkoutSessionId.startsWith('cs_')) {
    throw new Error('A valid PayMongo checkout session ID is required.');
  }

  const endpoint = `${PAYMONGO_API_BASE}/v1/checkout_sessions/${encodeURIComponent(
    checkoutSessionId
  )}/expire`;

  const result = await payMongoFetch({
    endpoint,
    method: 'POST',
  });

  const resource =
    result.parsedBody as PayMongoResource<CheckoutAttributes> | null;

  if (!resource?.data?.id) {
    throw new Error('PayMongo did not return an expired checkout session.');
  }

  return {
    id: resource.data.id,
    status: resource.data.attributes?.status ?? 'expired',
  };
}

export async function createPayMongoRefund(input: {
  idempotencyKey: string;
  paymentId: string;
  amount: number;
  reason?: PayMongoRefundReason;
  notes?: string;
  /**
   * Kept for source compatibility with existing callers. PayMongo's current
   * Refund API does not document metadata as a supported request attribute,
   * so it is intentionally not sent in the API payload.
   */
  metadata?: Record<string, string>;
}) {
  const idempotencyKey = input.idempotencyKey.trim();
  const paymentId = input.paymentId.trim();
  const amount = Number(input.amount);

  if (!idempotencyKey) {
    throw new Error('PayMongo refund idempotency key is required.');
  }

  if (!paymentId.startsWith('pay_')) {
    throw new Error('A valid PayMongo payment ID is required for a refund.');
  }

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('PayMongo refund amount must be a positive integer.');
  }

  const endpoint = `${PAYMONGO_API_BASE}/v1/refunds`;
  const result = await payMongoFetch({
    endpoint,
    method: 'POST',
    idempotencyKey,
    body: {
      data: {
        attributes: {
          amount,
          payment_id: paymentId,
          // PayMongo's Refund API currently accepts only:
          // duplicate, fraudulent, or others.
          reason: input.reason ?? 'others',
          notes: (input.notes || 'Automatic CloudView refund').slice(0, 255),
        },
      },
    },
  });

  const resource = result.parsedBody as PayMongoResource<RefundAttributes> | null;

  if (!resource?.data?.id || !resource.data.attributes?.status) {
    throw new Error('PayMongo did not return a valid refund resource.');
  }

  return {
    id: resource.data.id,
    status: resource.data.attributes.status,
    amount: resource.data.attributes.amount,
    paymentId: resource.data.attributes.payment_id,
  };
}
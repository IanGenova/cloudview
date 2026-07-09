import "server-only";

const PAYMONGO_API_BASE = "https://api.paymongo.com";

export type PayMongoLineItem = {
  name: string;
  amount: number;
  currency: "PHP";
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

type PayMongoErrorBody = {
  errors?: Array<{
    code?: string;
    detail?: string;
    source?: { pointer?: string };
  }>;
};

function getSecretKey() {
  const key = process.env.PAYMONGO_SECRET_KEY?.trim();

  if (!key) {
    throw new Error("PAYMONGO_SECRET_KEY is not configured.");
  }

  if (!key.startsWith("sk_test_") && !key.startsWith("sk_live_")) {
    throw new Error(
      "PAYMONGO_SECRET_KEY must be a PayMongo secret key beginning with sk_test_ or sk_live_.",
    );
  }

  return key;
}

function getBasicAuthorization() {
  return `Basic ${Buffer.from(`${getSecretKey()}:`).toString("base64")}`;
}

function parseJsonSafely(value: string): unknown {
  if (!value) {
    return null;
  }

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
  const firstError = parsed?.errors?.[0];

  if (firstError?.detail) {
    const pointer = firstError.source?.pointer
      ? ` (${firstError.source.pointer})`
      : "";

    return `PayMongo ${input.status}: ${firstError.detail}${pointer}`;
  }

  const compactBody = input.rawBody.replace(/\s+/g, " ").trim().slice(0, 300);

  if (compactBody) {
    return `PayMongo ${input.status} from ${input.endpoint}: ${compactBody}`;
  }

  return `PayMongo ${input.status} ${input.statusText || "request failed"} from ${input.endpoint}.`;
}

async function postCheckoutSession(input: {
  version: "v1" | "v2";
  idempotencyKey: string;
  body: unknown;
}) {
  const endpoint = `${PAYMONGO_API_BASE}/${input.version}/checkout_sessions`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: getBasicAuthorization(),
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify(input.body),
    cache: "no-store",
  });

  const rawBody = await response.text();
  const parsedBody = parseJsonSafely(rawBody);

  return {
    endpoint,
    response,
    rawBody,
    parsedBody,
  };
}

export function getPayMongoPaymentMethods() {
  const configured = process.env.PAYMONGO_PAYMENT_METHODS?.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return configured?.length ? configured : ["card", "gcash", "qrph"];
}

export async function createPayMongoCheckoutSession(input: {
  idempotencyKey: string;
  lineItems: PayMongoLineItem[];
  successUrl: string;
  cancelUrl: string;
  description: string;
  referenceNumber: string;
  metadata: Record<string, string>;
}) {
  const body = {
    data: {
      attributes: {
        line_items: input.lineItems,
        payment_method_types: getPayMongoPaymentMethods(),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        description: input.description,
        reference_number: input.referenceNumber,
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        metadata: input.metadata,
      },
    },
  };

  // PayMongo recommends V2 for new integrations. Some accounts or gateways may
  // still return 404 for V2, so retry V1 only for that exact response.
  let result = await postCheckoutSession({
    version: "v2",
    idempotencyKey: input.idempotencyKey,
    body,
  });

  if (result.response.status === 404) {
    console.warn(
      `[PayMongo] V2 checkout endpoint returned 404. Retrying V1. Endpoint: ${result.endpoint}`,
    );

    result = await postCheckoutSession({
      version: "v1",
      idempotencyKey: input.idempotencyKey,
      body,
    });
  }

  if (!result.response.ok) {
    throw new Error(
      getPayMongoErrorMessage({
        endpoint: result.endpoint,
        status: result.response.status,
        statusText: result.response.statusText,
        rawBody: result.rawBody,
        parsedBody: result.parsedBody,
      }),
    );
  }

  const resource =
    result.parsedBody as PayMongoResource<CheckoutAttributes> | null;

  if (!resource?.data?.id || !resource.data.attributes?.checkout_url) {
    throw new Error("PayMongo did not return a valid checkout session.");
  }

  return {
    id: resource.data.id,
    checkoutUrl: resource.data.attributes.checkout_url,
  };
}

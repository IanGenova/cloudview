import 'server-only';

const XENDIT_PAYOUT_API = 'https://api.xendit.co/v3/payouts';
const XENDIT_PAYOUT_API_VERSION = '2025-09-09';
const REQUEST_TIMEOUT_MS = 25_000;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type XenditPayoutRecipient = {
  type: 'INDIVIDUAL' | 'BUSINESS';
  given_name?: string;
  surname?: string;
  business_name?: string;
  relationship: string;
  account_details: {
    currency: 'PHP';
    account_country: 'PH';
    account_holder_name: string;
    account_number: string;
    /** Examples depend on the bank/e-wallet route enabled by Xendit. */
    routing_type_1: string;
    routing_value_1: string;
    routing_type_2?: string;
    routing_value_2?: string;
  };
  details?: Record<string, JsonValue>;
  address?: {
    country: 'PH';
    province_state?: string;
    city?: string;
    street_line1?: string;
    street_line2?: string;
    postal_code?: string;
  };
};

export type XenditPayoutResult = {
  payoutId: string;
  referenceId: string;
  status: string;
  destinationAmountCents: number;
  destinationCurrency: string;
  estimatedArrivalTime: string | null;
  businessId: string | null;
};

function getSecretKey() {
  const key = process.env.XENDIT_SECRET_KEY?.trim();

  if (!key?.startsWith('xnd_')) {
    throw new Error('XENDIT_SECRET_KEY must be configured before creating payouts.');
  }

  return key;
}

function safeText(value: string, label: string, maxLength = 255) {
  const result = value.trim().slice(0, maxLength);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function validateRecipient(recipient: XenditPayoutRecipient) {
  const details = recipient.account_details;

  safeText(recipient.relationship, 'Payout recipient relationship', 80);
  safeText(details.account_holder_name, 'Payout account holder name', 255);
  safeText(details.account_number, 'Payout account number', 255);
  safeText(details.routing_type_1, 'Payout routing type', 80);
  safeText(details.routing_value_1, 'Payout routing value', 255);

  if (recipient.type === 'BUSINESS' && !recipient.business_name?.trim()) {
    throw new Error('Business name is required for a business payout recipient.');
  }

  if (
    recipient.type === 'INDIVIDUAL' &&
    !recipient.given_name?.trim() &&
    !recipient.surname?.trim()
  ) {
    throw new Error('Recipient name is required for an individual payout recipient.');
  }
}

/**
 * Creates a deliberate outgoing bank/e-wallet payout using Xendit Payouts v3.
 *
 * This is intentionally separate from xenPlatform Split Rules. Split Rules route
 * funds between CloudView and hotel Xendit balances during settlement; this API
 * sends an already-available balance to a bank or supported e-wallet destination.
 * Recipient routing fields must follow Xendit's current PH Dynamic Schema/Payout
 * Coverage for the chosen bank or e-wallet.
 */
export async function createXenditPayout(input: {
  idempotencyKey: string;
  referenceId: string;
  recipient: XenditPayoutRecipient;
  amountCents: number;
  description: string;
  sourceOfFund: string;
  purposeCode: string;
  metadata?: Record<string, JsonPrimitive>;
  /** Use the hotel Business ID to pay from that hotel sub-account when enabled. */
  forUserId?: string | null;
}): Promise<XenditPayoutResult> {
  const idempotencyKey = safeText(input.idempotencyKey, 'Payout idempotency key');
  const referenceId = safeText(input.referenceId, 'Payout reference ID');
  const description = safeText(input.description, 'Payout description', 100);
  const sourceOfFund = safeText(input.sourceOfFund, 'Payout source of fund', 80);
  const purposeCode = safeText(input.purposeCode, 'Payout purpose code', 80);
  const amountCents = Number(input.amountCents);

  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error('Payout amount must be a positive integer number of centavos.');
  }

  validateRecipient(input.recipient);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(XENDIT_PAYOUT_API, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${getSecretKey()}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        'Idempotency-key': idempotencyKey,
        'Api-version': XENDIT_PAYOUT_API_VERSION,
        ...(input.forUserId?.trim()
          ? { 'for-user-id': input.forUserId.trim() }
          : {}),
      },
      body: JSON.stringify({
        reference_id: referenceId,
        recipient: input.recipient,
        payout_details: {
          source_currency: 'PHP',
          destination_currency: 'PHP',
          destination_amount: amountCents,
        },
        source_of_fund: sourceOfFund,
        purpose_code: purposeCode,
        description,
        metadata: input.metadata ?? {},
      }),
      cache: 'no-store',
      signal: controller.signal,
    });

    const raw = await response.text();
    let body: Record<string, unknown> | null = null;

    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      body = null;
    }

    if (!response.ok) {
      const code = typeof body?.error_code === 'string' ? body.error_code : null;
      const message = typeof body?.message === 'string' ? body.message : raw.slice(0, 500);
      throw new Error(
        `Xendit payout ${response.status}${code ? ` ${code}` : ''}: ${message || response.statusText}`
      );
    }

    const payoutId = typeof body?.payout_id === 'string' ? body.payout_id : '';
    const status = typeof body?.status === 'string' ? body.status : '';

    if (!payoutId || !status) {
      throw new Error('Xendit did not return a valid payout response.');
    }

    return {
      payoutId,
      referenceId:
        typeof body?.reference_id === 'string' ? body.reference_id : referenceId,
      status,
      destinationAmountCents:
        typeof body?.destination_amount === 'number'
          ? Math.round(body.destination_amount)
          : amountCents,
      destinationCurrency:
        typeof body?.destination_currency === 'string'
          ? body.destination_currency
          : 'PHP',
      estimatedArrivalTime:
        typeof body?.estimated_arrival_time === 'string'
          ? body.estimated_arrival_time
          : null,
      businessId:
        typeof body?.business_id === 'string' ? body.business_id : null,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Xendit payout request timed out. Retry with the same idempotency key.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

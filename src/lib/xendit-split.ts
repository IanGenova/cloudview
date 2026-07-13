import 'server-only';

import { createHash } from 'crypto';
import { db } from '@/lib/db';
import {
  calculateXenditSplitRoute,
  type XenditCommissionType,
  type XenditFeeBearer,
} from '@/lib/xendit-split-calculator';

const XENDIT_API_BASE = 'https://api.xendit.co';
const BUSINESS_ID_PATTERN = /^[a-f0-9]{24}$/i;
const SPLIT_RULE_ID_PATTERN = /^splitru_[A-Za-z0-9-]+$/;
const XENDIT_REQUEST_TIMEOUT_MS = 25_000;

export type { XenditCommissionType, XenditFeeBearer } from '@/lib/xendit-split-calculator';

export type XenditSplitPayment = {
  /** Set when the hotel sub-account is the source account. */
  forUserId?: string;
  splitRuleId: string;
};

export type XenditSplitSnapshot = {
  enabled: true;
  masterAccountId: string;
  hotelAccountId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  splitRuleId: string;
  commissionType: XenditCommissionType;
  commissionValue: number;
  feeBearer: XenditFeeBearer;
  routeType: 'PERCENT' | 'FLAT';
  routeValue: number;
};

type HotelSplitSettings = {
  xenditSplitEnabled?: boolean | null;
  xenditLinkedAccountId?: string | null;
  xenditCommissionType?: string | null;
  xenditCommissionValue?: number | null;
  xenditFeeBearer?: string | null;
  xenditSplitRuleId?: string | null;
  xenditSplitRuleSignature?: string | null;
};

type SplitRuleResponse = {
  split_rule_id?: string;
  id?: string;
};

function getSecretKey() {
  const key = process.env.XENDIT_SECRET_KEY?.trim();
  if (!key?.startsWith('xnd_')) {
    throw new Error('XENDIT_SECRET_KEY must be configured before creating split rules.');
  }
  return key;
}

export function normalizeXenditBusinessId(
  value: string | null | undefined,
  label: string
) {
  const businessId = value?.trim() || '';

  if (!BUSINESS_ID_PATTERN.test(businessId)) {
    throw new Error(`${label} must be a valid 24-character Xendit Business ID.`);
  }

  return businessId;
}

/** Kept as an alias so older imports in the settings module remain source-compatible. */
export const normalizeXenditOrganizationId = normalizeXenditBusinessId;

export function getXenditPlatformMerchantId() {
  return normalizeXenditBusinessId(
    process.env.XENDIT_MASTER_ACCOUNT_ID || process.env.XENDIT_PLATFORM_MERCHANT_ID,
    'XENDIT_MASTER_ACCOUNT_ID'
  );
}

export function getXenditForUserIdFromPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const split = (value as Record<string, unknown>).xenditSplit;
  if (!split || typeof split !== 'object' || Array.isArray(split)) {
    return null;
  }

  const snapshot = split as Record<string, unknown>;
  const feeBearer =
    typeof snapshot.feeBearer === 'string' ? snapshot.feeBearer : '';
  const sourceAccountId =
    typeof snapshot.sourceAccountId === 'string'
      ? snapshot.sourceAccountId.trim()
      : '';

  return feeBearer === 'HOTEL' && BUSINESS_ID_PATTERN.test(sourceAccountId)
    ? sourceAccountId
    : null;
}

function parseCommissionType(value: string | null | undefined) {
  if (value === 'FIXED') return 'FIXED' as const;
  if (value === 'PERCENTAGE_NET' || !value) return 'PERCENTAGE_NET' as const;
  throw new Error('Unsupported Xendit commission type.');
}

function parseFeeBearer(value: string | null | undefined) {
  if (value === 'CLOUDVIEW') return 'CLOUDVIEW' as const;
  if (value === 'HOTEL' || !value) return 'HOTEL' as const;
  throw new Error('Unsupported Xendit processing-fee bearer.');
}

async function createSplitRule(input: {
  hotelId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  routeType: 'PERCENT' | 'FLAT';
  routeValue: number;
  signature: string;
}) {
  const referenceId = `cloudview_${input.hotelId}_${input.signature.slice(0, 16)}`.slice(0, 255);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), XENDIT_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${XENDIT_API_BASE}/split_rules`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${getSecretKey()}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `CloudView hotel commission ${input.hotelId}`.slice(0, 255),
        description: `CloudView fee route from ${input.sourceAccountId} to ${input.destinationAccountId}`,
        routes: [
          {
            ...(input.routeType === 'PERCENT'
              ? { percent_amount: input.routeValue }
              : { flat_amount: input.routeValue }),
            currency: 'PHP',
            destination_account_id: input.destinationAccountId,
            reference_id: referenceId,
          },
        ],
      }),
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Xendit split-rule request timed out after ${XENDIT_REQUEST_TIMEOUT_MS / 1000} seconds.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const raw = await response.text();
  let parsed: SplitRuleResponse | null = null;
  try {
    parsed = raw ? (JSON.parse(raw) as SplitRuleResponse) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(`Xendit ${response.status} while creating split rule: ${raw.slice(0, 500)}`);
  }

  const splitRuleId = parsed?.split_rule_id || parsed?.id;
  if (!splitRuleId || !SPLIT_RULE_ID_PATTERN.test(splitRuleId)) {
    throw new Error('Xendit did not return a valid split rule ID.');
  }

  return splitRuleId;
}

export async function buildXenditSplitConfiguration(input: {
  hotelId: string;
  amountCents: number;
  settings?: HotelSplitSettings | null;
}) {
  if (!input.settings?.xenditSplitEnabled) return null;

  const amountCents = Number(input.amountCents);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error('A positive checkout amount is required for Xendit splitting.');
  }

  const masterAccountId = getXenditPlatformMerchantId();
  const hotelAccountId = normalizeXenditBusinessId(
    input.settings.xenditLinkedAccountId,
    'Hotel Xendit linked account ID'
  );

  if (masterAccountId === hotelAccountId) {
    throw new Error('The CloudView master and hotel Xendit Business IDs must be different.');
  }

  const commissionType = parseCommissionType(input.settings.xenditCommissionType);
  const feeBearer = parseFeeBearer(input.settings.xenditFeeBearer);
  const commissionValue = Number(input.settings.xenditCommissionValue ?? 0);

  const sourceAccountId = feeBearer === 'HOTEL' ? hotelAccountId : masterAccountId;
  const destinationAccountId = feeBearer === 'HOTEL' ? masterAccountId : hotelAccountId;
  const { routeType, routeValue } = calculateXenditSplitRoute({
    amountCents,
    commissionType,
    commissionValue,
    feeBearer,
  });

  const signature = createHash('sha256')
    .update(
      JSON.stringify({
        sourceAccountId,
        destinationAccountId,
        routeType,
        routeValue,
        currency: 'PHP',
      })
    )
    .digest('hex');

  let splitRuleId = input.settings.xenditSplitRuleId?.trim() || '';
  const canReuse =
    SPLIT_RULE_ID_PATTERN.test(splitRuleId) &&
    input.settings.xenditSplitRuleSignature === signature;

  if (!canReuse) {
    splitRuleId = await createSplitRule({
      hotelId: input.hotelId,
      sourceAccountId,
      destinationAccountId,
      routeType,
      routeValue,
      signature,
    });

    await db.hotelSettings.updateMany({
      where: { hotelId: input.hotelId },
      data: {
        xenditSplitRuleId: splitRuleId,
        xenditSplitRuleSignature: signature,
      },
    });
  }

  const splitPayment: XenditSplitPayment = {
    splitRuleId,
    ...(feeBearer === 'HOTEL' ? { forUserId: hotelAccountId } : {}),
  };

  const snapshot: XenditSplitSnapshot = {
    enabled: true,
    masterAccountId,
    hotelAccountId,
    sourceAccountId,
    destinationAccountId,
    splitRuleId,
    commissionType,
    commissionValue,
    feeBearer,
    routeType,
    routeValue,
  };

  return { splitPayment, snapshot };
}

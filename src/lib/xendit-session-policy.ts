import 'server-only';

import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import {
  getXenditCheckoutSession,
  type XenditCheckoutSessionStatus,
} from '@/lib/xendit';

const FALLBACK_SESSION_LIFETIME_MS = 35 * 60 * 1000;
const EXPIRY_SAFETY_WINDOW_MS = 15 * 1000;
const SESSION_PREPARATION_GRACE_MS = 2 * 60 * 1000;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => typeof item !== 'undefined')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }

  return value;
}

export function createXenditIntentFingerprint(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

export function readXenditIntentFingerprint(value: Prisma.JsonValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const fingerprint = (value as Prisma.JsonObject).paymentIntentFingerprint;
  return typeof fingerprint === 'string' && /^[a-f0-9]{64}$/i.test(fingerprint)
    ? fingerprint.toLowerCase()
    : null;
}

function parseDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type XenditExistingSessionDecision =
  | {
      action: 'CONTINUE';
      checkoutUrl: string;
      checkoutSessionId: string;
      status: 'ACTIVE';
      expiresAt: Date | null;
      paymentId: string | null;
      paymentRequestId: string | null;
      verifiedRemotely: boolean;
      amountCents: number | null;
      currency: string | null;
    }
  | {
      action: 'COMPLETED';
      checkoutUrl: string | null;
      checkoutSessionId: string;
      status: 'COMPLETED';
      expiresAt: Date | null;
      paymentId: string | null;
      paymentRequestId: string | null;
      verifiedRemotely: true;
      amountCents: number | null;
      currency: string | null;
    }
  | {
      action: 'REPLACE';
      remoteStatus: Exclude<XenditCheckoutSessionStatus, 'ACTIVE' | 'COMPLETED'> | null;
      reason: string;
    }
  | {
      action: 'WAIT';
      reason: string;
    };

export async function decideExistingXenditSession(input: {
  checkoutSessionId: string | null;
  checkoutUrl: string | null;
  expiresAt?: string | Date | null;
  createdAt?: string | Date | null;
  forUserId?: string | null;
}): Promise<XenditExistingSessionDecision> {
  const checkoutSessionId = input.checkoutSessionId?.trim() || '';
  const checkoutUrl = input.checkoutUrl?.trim() || '';
  const explicitExpiresAt = parseDate(input.expiresAt);
  const createdAt = parseDate(input.createdAt);
  const fallbackExpiresAt = createdAt
    ? new Date(createdAt.getTime() + FALLBACK_SESSION_LIFETIME_MS)
    : null;
  const localExpiresAt = explicitExpiresAt ?? fallbackExpiresAt;
  const locallyUsable =
    Boolean(checkoutSessionId && checkoutUrl) &&
    (!localExpiresAt ||
      localExpiresAt.getTime() > Date.now() + EXPIRY_SAFETY_WINDOW_MS);

  if (!checkoutSessionId) {
    const preparationIsStale = createdAt
      ? Date.now() - createdAt.getTime() >= SESSION_PREPARATION_GRACE_MS
      : false;

    if (checkoutUrl || preparationIsStale) {
      return {
        action: 'REPLACE',
        remoteStatus: null,
        reason: checkoutUrl
          ? 'The local checkout is missing its Xendit Payment Session ID.'
          : 'The previous Xendit checkout did not finish preparing and was replaced.',
      };
    }

    return {
      action: 'WAIT',
      reason: 'The Xendit checkout is still being prepared. Please try again shortly.',
    };
  }

  try {
    const remote = await getXenditCheckoutSession(
      checkoutSessionId,
      input.forUserId
    );
    const remoteExpiresAt = parseDate(remote.expiresAt) ?? localExpiresAt;

    if (remote.status === 'ACTIVE') {
      const activeUrl = remote.checkoutUrl || checkoutUrl;

      if (
        !activeUrl ||
        (remoteExpiresAt &&
          remoteExpiresAt.getTime() <= Date.now() + EXPIRY_SAFETY_WINDOW_MS)
      ) {
        return {
          action: 'REPLACE',
          remoteStatus: 'EXPIRED',
          reason: 'The active Xendit checkout no longer has a usable payment link.',
        };
      }

      return {
        action: 'CONTINUE',
        checkoutUrl: activeUrl,
        checkoutSessionId: remote.id,
        status: 'ACTIVE',
        expiresAt: remoteExpiresAt,
        paymentId: remote.paymentId,
        paymentRequestId: remote.paymentRequestId,
        verifiedRemotely: true,
        amountCents: remote.amountCents,
        currency: remote.currency,
      };
    }

    if (remote.status === 'COMPLETED') {
      return {
        action: 'COMPLETED',
        checkoutUrl: remote.checkoutUrl || checkoutUrl || null,
        checkoutSessionId: remote.id,
        status: 'COMPLETED',
        expiresAt: remoteExpiresAt,
        paymentId: remote.paymentId,
        paymentRequestId: remote.paymentRequestId,
        verifiedRemotely: true,
        amountCents: remote.amountCents,
        currency: remote.currency,
      };
    }

    return {
      action: 'REPLACE',
      remoteStatus: remote.status,
      reason: `The previous Xendit Payment Session is ${remote.status.toLowerCase()}.`,
    };
  } catch (error) {
    if (locallyUsable) {
      return {
        action: 'CONTINUE',
        checkoutUrl,
        checkoutSessionId,
        status: 'ACTIVE',
        expiresAt: localExpiresAt,
        paymentId: null,
        paymentRequestId: null,
        verifiedRemotely: false,
        amountCents: null,
        currency: null,
      };
    }

    return {
      action: 'WAIT',
      reason:
        error instanceof Error
          ? `Unable to verify the previous Xendit checkout: ${error.message}`
          : 'Unable to verify the previous Xendit checkout.',
    };
  }
}

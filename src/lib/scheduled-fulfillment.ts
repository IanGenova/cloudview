import {
  FulfillmentTiming,
  ScheduledReleaseStatus,
} from '@prisma/client';
import { cleanText } from '@/lib/sanitize';

export function parseFulfillmentTiming(value: unknown) {
  return value === FulfillmentTiming.SCHEDULED || value === 'SCHEDULED'
    ? FulfillmentTiming.SCHEDULED
    : FulfillmentTiming.ASAP;
}

export function parseScheduledDate(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const raw = value.trim();

  if (!raw) {
    return null;
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function buildScheduledFulfillment({
  fulfillmentTiming,
  scheduledFor,
  scheduledNote,
  releaseBufferMinutes,
}: {
  fulfillmentTiming: FulfillmentTiming;
  scheduledFor?: Date | null;
  scheduledNote?: string | null;
  releaseBufferMinutes: number;
}) {
  const now = new Date();

  if (fulfillmentTiming === FulfillmentTiming.ASAP) {
    return {
      fulfillmentTiming: FulfillmentTiming.ASAP,
      scheduledFor: null,
      scheduledWindowStart: null,
      scheduledWindowEnd: null,
      releaseAt: null,
      releasedAt: now,
      scheduledReleaseStatus: ScheduledReleaseStatus.NOT_SCHEDULED,
      scheduledNote: null,
    };
  }

  if (!scheduledFor) {
    throw new Error('Scheduled date and time are required.');
  }

  if (scheduledFor.getTime() <= now.getTime() + 60_000) {
    throw new Error('Scheduled time must be in the future.');
  }

  const releaseAtCandidate = new Date(
    scheduledFor.getTime() - releaseBufferMinutes * 60 * 1000
  );

  const releaseAt =
    releaseAtCandidate.getTime() <= now.getTime()
      ? now
      : releaseAtCandidate;

  return {
    fulfillmentTiming: FulfillmentTiming.SCHEDULED,
    scheduledFor,
    scheduledWindowStart: null,
    scheduledWindowEnd: null,
    releaseAt,
    releasedAt: null,
    scheduledReleaseStatus: ScheduledReleaseStatus.SCHEDULED,
    scheduledNote: cleanText(scheduledNote || '', 300) || null,
  };
}
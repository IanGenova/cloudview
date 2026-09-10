/**
 * When a business day starts and ends.
 *
 * CloudView is a Philippine hospitality product. Its days begin at midnight in
 * Manila, and four separate defects came from there being no single place that
 * said so.
 *
 * `TZ` is set in no `.env`, no ecosystem file and no deploy script, so the
 * Node process inherits the host zone -- UTC on a stock Ubuntu VPS. The
 * codebase already pins `Asia/Manila` explicitly in five places, which is only
 * ever necessary because the process clock is not Manila. Anything using
 * `setHours(0,0,0,0)` or `toISOString().slice(0,10)` was therefore computing a
 * day boundary eight hours away from the one the hotel lives by, and the two
 * wrong answers did not even agree with each other:
 *
 *   The NFC loyalty cap keyed once-per-tag-per-day off UTC and bounded its cap
 *   aggregate off server-local time. They rolled over eight hours apart, so a
 *   guest could take the daily maximum twice inside one Manila day.
 *
 *   The daily sales report covered 08:00 on the day to 07:59 the next, so
 *   every peso a bar or late room service took before 8am was reported on the
 *   previous day, and the till could not be reconciled against it.
 *
 *   Reward validity windows were dead until 8am on their first day and alive
 *   until 8am on the day after their last.
 *
 * The key is derived through Intl rather than by adding eight hours. Manila has
 * had a fixed +08:00 offset with no daylight saving since 1978, so the
 * arithmetic would be correct today -- but deriving it means this stays correct
 * if that ever changes, and costs nothing.
 */

export const BUSINESS_TIME_ZONE = 'Asia/Manila';

/* en-CA gives yyyy-mm-dd, which sorts and compares as a string. */
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const VALID_DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The Manila calendar date an instant falls on, as `yyyy-mm-dd`. */
export function businessDayKey(date: Date) {
  return dayKeyFormatter.format(date);
}

/**
 * Turns a `yyyy-mm-dd` into the instant that day begins in Manila.
 *
 * Returns null rather than guessing. The old parseDate fell back to "today" on
 * anything it could not read, so a typo in a report's date field silently
 * produced a different report instead of an error.
 */
export function parseBusinessDate(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = VALID_DAY_KEY.exec(value.trim());

  if (!match) {
    return null;
  }

  const parsed = new Date(`${value.trim()}T00:00:00+08:00`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  /*
   * Date() rolls 2026-02-30 forward into March rather than refusing it, so the
   * only reliable check is whether the instant we built still reports the date
   * we asked for.
   */
  if (businessDayKey(parsed) !== value.trim()) {
    return null;
  }

  return parsed;
}

/** The instant the Manila day containing `date` begins. */
export function startOfBusinessDay(date: Date) {
  return new Date(`${businessDayKey(date)}T00:00:00+08:00`);
}

/**
 * The last representable instant of that Manila day.
 *
 * Inclusive, because every caller uses it as an `lte` bound.
 */
export function endOfBusinessDay(date: Date) {
  const start = startOfBusinessDay(date);

  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function businessDayBounds(date: Date) {
  return {
    start: startOfBusinessDay(date),
    end: endOfBusinessDay(date),
  };
}

/*
 * Already carries a zone: a trailing Z, or a +hh:mm / -hh:mm offset after the
 * time. Anchored on `T` so a date's own hyphens are never mistaken for one.
 */
const HAS_EXPLICIT_ZONE = /T.*(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Reads a `datetime-local` value as a wall-clock time in Manila.
 *
 * `<input type="datetime-local">` submits a bare `2026-09-11T12:00` with no
 * zone, and `new Date()` reads that as *server*-local. On a UTC host a front
 * desk setting checkout to noon stored 20:00 Manila -- and since the edit form
 * rendered the stored instant back in the *browser's* zone, reopening the
 * dialog showed 20:00 and saving any unrelated field pushed checkout another
 * eight hours out. Every edit moved it again.
 *
 * A value that already carries a zone is respected, so callers submitting a
 * full ISO instant are unaffected.
 */
export function parseBusinessDateTime(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null;
  }

  const raw = value.trim();

  if (!raw) {
    return null;
  }

  const parsed = new Date(HAS_EXPLICIT_ZONE.test(raw) ? raw : `${raw}+08:00`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Renders an instant as a `datetime-local` value in Manila wall-clock time. */
export function toBusinessDateTimeInputValue(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';

  /* en-CA renders midnight as 24; datetime-local wants 00. */
  const hour = get('hour') === '24' ? '00' : get('hour');

  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

/** Shifts by whole Manila days, which is not the same as adding 24 hours. */
export function addBusinessDays(date: Date, days: number) {
  const start = startOfBusinessDay(date);
  const shifted = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

  return startOfBusinessDay(shifted);
}

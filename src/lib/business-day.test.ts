import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BUSINESS_TIME_ZONE,
  businessDayBounds,
  businessDayKey,
  endOfBusinessDay,
  parseBusinessDate,
  parseBusinessDateTime,
  startOfBusinessDay,
  toBusinessDateTimeInputValue,
} from './business-day';

/*
 * When a business day starts and ends, for a hotel in Manila.
 *
 * Four separate defects came from there being no answer to this. TZ is set in
 * no .env, no ecosystem file and no deploy script, so the process inherits the
 * host zone -- UTC on a stock Ubuntu VPS. Meanwhile the codebase pins
 * 'Asia/Manila' explicitly in five places, which is only ever necessary
 * because the process clock is not Manila.
 *
 * What that cost:
 *
 *   The NFC loyalty cap built its once-per-tag-per-day key from toISOString()
 *   (UTC) and its cap window from setHours() (server-local). The two rolled
 *   over eight hours apart, so a guest could take the daily maximum twice in
 *   one Manila day -- and reclaim the same tag inside it.
 *
 *   Reports built "today" from server-local midnight while Analytics bucketed
 *   the same createdAt by Manila. The daily sales report for the 11th actually
 *   covered 08:00 on the 11th to 07:59 on the 12th, so every peso taken before
 *   8am was reported on the previous day and the till never reconciled.
 *
 *   Reward validity windows were anchored the same way, so a reward valid "the
 *   11th only" was dead until 8am and alive until 8am the next day.
 *
 * All of them want one function. This is it.
 */

test('the business zone is Manila', () => {
  assert.equal(BUSINESS_TIME_ZONE, 'Asia/Manila');
});

test('the day key is the Manila calendar date, not the UTC one', () => {
  // 22:00 UTC on 10 Sep is already 06:00 on 11 Sep in Manila.
  assert.equal(
    businessDayKey(new Date('2026-09-10T22:00:00Z')),
    '2026-09-11'
  );

  // 15:00 UTC on 10 Sep is 23:00 the same day in Manila.
  assert.equal(
    businessDayKey(new Date('2026-09-10T15:00:00Z')),
    '2026-09-10'
  );
});

test('a day starts at Manila midnight', () => {
  assert.equal(
    startOfBusinessDay(new Date('2026-09-11T03:00:00Z')).toISOString(),
    '2026-09-10T16:00:00.000Z'
  );
});

test('a day ends the instant before the next one starts', () => {
  const end = endOfBusinessDay(new Date('2026-09-11T03:00:00Z'));

  assert.equal(end.toISOString(), '2026-09-11T15:59:59.999Z');
});

/*
 * The end is inclusive, because every caller uses it as an `lte` bound. So the
 * span is one millisecond short of 24 hours, and the next day's start is
 * exactly one millisecond later -- no gap, no overlap.
 */
test('bounds cover a whole day inclusively, and abut the next', () => {
  const { start, end } = businessDayBounds(new Date('2026-09-11T03:00:00Z'));

  assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000 - 1);

  const nextStart = startOfBusinessDay(new Date(end.getTime() + 1));

  assert.equal(nextStart.getTime(), end.getTime() + 1);
});

/*
 * The bug, stated directly: the tap at 05:00 Manila and the tap at 09:00
 * Manila on the same date must land in the same window and share a day key.
 * Under the old pair they did not -- the first fell in the previous UTC day.
 */
test('05:00 and 09:00 Manila on one date are the same business day', () => {
  const early = new Date('2026-09-10T21:00:00Z'); // 05:00 Manila, 11 Sep
  const late = new Date('2026-09-11T01:00:00Z'); //  09:00 Manila, 11 Sep

  assert.equal(businessDayKey(early), businessDayKey(late));
  assert.equal(businessDayKey(early), '2026-09-11');

  const bounds = businessDayBounds(early);

  assert.equal(bounds.start <= late && late <= bounds.end, true);
});

test('an instant one millisecond before Manila midnight belongs to the day before', () => {
  const justBefore = new Date('2026-09-10T15:59:59.999Z');
  const midnight = new Date('2026-09-10T16:00:00.000Z');

  assert.equal(businessDayKey(justBefore), '2026-09-10');
  assert.equal(businessDayKey(midnight), '2026-09-11');
});

test('a yyyy-mm-dd string parses to Manila midnight', () => {
  const parsed = parseBusinessDate('2026-09-11');

  assert.notEqual(parsed, null);
  assert.equal(parsed!.toISOString(), '2026-09-10T16:00:00.000Z');
});

test('a parsed date round-trips to its own key', () => {
  for (const key of ['2026-01-01', '2026-06-15', '2026-12-31']) {
    assert.equal(businessDayKey(parseBusinessDate(key)!), key);
  }
});

test('an invalid date string is refused rather than guessed at', () => {
  for (const value of [
    '',
    'today',
    '2026-13-01',
    '2026-02-30',
    '11-09-2026',
    '2026-9-1',
    undefined,
    null,
  ]) {
    assert.equal(
      parseBusinessDate(value as never),
      null,
      JSON.stringify(value)
    );
  }
});

test('a leap day is a real date', () => {
  assert.equal(parseBusinessDate('2028-02-29')?.toISOString(), '2028-02-28T16:00:00.000Z');
  assert.equal(parseBusinessDate('2026-02-29'), null);
});

/*
 * Manila has had no daylight saving since 1978 and a fixed +08:00 offset, so
 * a fixed offset is correct here -- but the key is derived from Intl rather
 * than by adding eight hours, so this stays right if that ever changes.
 */
test('the offset is derived, not hardcoded into the key', () => {
  assert.equal(businessDayKey(new Date('2026-01-15T16:00:00Z')), '2026-01-16');
  assert.equal(businessDayKey(new Date('2026-07-15T16:00:00Z')), '2026-07-16');
});

/*
 * A datetime-local input submits a bare wall-clock string with no zone, and
 * new Date() reads that as server-local. On a UTC host a front desk setting
 * checkout to noon stored 20:00 Manila; the edit form then rendered the stored
 * instant back in the browser's zone, so reopening it showed 20:00 and saving
 * any unrelated field pushed checkout another eight hours out. Every edit
 * moved it again, and activeStayWhere() gates room-device access on that
 * column -- so a departed guest's phone kept ordering room service.
 */
test('a bare datetime-local value is read as Manila wall-clock time', () => {
  assert.equal(
    parseBusinessDateTime('2026-09-11T12:00')?.toISOString(),
    '2026-09-11T04:00:00.000Z'
  );
});

test('a value that already carries a zone is respected', () => {
  assert.equal(
    parseBusinessDateTime('2026-09-11T12:00:00Z')?.toISOString(),
    '2026-09-11T12:00:00.000Z'
  );

  assert.equal(
    parseBusinessDateTime('2026-09-11T12:00:00+00:00')?.toISOString(),
    '2026-09-11T12:00:00.000Z'
  );
});

test('a date-only or unreadable value is refused', () => {
  for (const value of ['', '   ', 'tomorrow', null, undefined]) {
    assert.equal(parseBusinessDateTime(value as never), null, JSON.stringify(value));
  }
});

/*
 * The round trip is the actual defect: render, save untouched, and the stored
 * instant must not move. This is what failed before, eight hours at a time.
 */
test('rendering and re-parsing leaves the instant where it was', () => {
  for (const iso of [
    '2026-09-11T04:00:00.000Z',
    '2026-01-01T16:00:00.000Z',
    '2026-12-31T15:59:00.000Z',
  ]) {
    const original = new Date(iso);
    const rendered = toBusinessDateTimeInputValue(original);
    const reparsed = parseBusinessDateTime(rendered);

    assert.equal(
      reparsed?.toISOString(),
      original.toISOString(),
      `${iso} moved to ${reparsed?.toISOString()} via ${rendered}`
    );
  }
});

test('midnight renders as 00, not 24', () => {
  const midnight = new Date('2026-09-10T16:00:00.000Z');

  assert.equal(toBusinessDateTimeInputValue(midnight), '2026-09-11T00:00');
});

import { describe, expect, test } from 'vitest'
import { addDays, addMonths, dayLabel, parseISODate, rangeBounds, relativeTime, shortDate, toISODate } from './dates'

// vitest.config.ts pins TZ to America/New_York: west of UTC with DST, so
// anything that slips through toISOString() or steps in 24h chunks fails here.

describe('toISODate / parseISODate', () => {
  test('uses the local calendar date, not the UTC one', () => {
    // 10:30pm on Jul 4 in New York is already Jul 5 in UTC.
    const lateEvening = new Date(2026, 6, 4, 22, 30)
    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-07-05')
    expect(toISODate(lateEvening)).toBe('2026-07-04')
  })

  test('pads months and days', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  test('parses to local midnight, ignoring any time part', () => {
    expect(parseISODate('2026-07-04')).toEqual(new Date(2026, 6, 4))
    expect(parseISODate('2026-07-04T00:00:00.000Z')).toEqual(new Date(2026, 6, 4))
  })

  test('round-trips', () => {
    expect(toISODate(parseISODate('2026-12-31'))).toBe('2026-12-31')
  })
})

describe('addDays / addMonths', () => {
  test('steps calendar days across the spring DST change', () => {
    // Mar 8 2026 is only 23 hours long in New York.
    expect(toISODate(addDays(new Date(2026, 2, 9), -1))).toBe('2026-03-08')
    expect(toISODate(addDays(new Date(2026, 2, 8), -1))).toBe('2026-03-07')
    expect(toISODate(addDays(new Date(2026, 2, 7), 2))).toBe('2026-03-09')
  })

  test('crosses month and year boundaries', () => {
    expect(toISODate(addDays(new Date(2026, 0, 1), -1))).toBe('2025-12-31')
    expect(toISODate(addMonths(new Date(2026, 0, 15), -1))).toBe('2025-12-15')
    expect(toISODate(addMonths(new Date(2026, 10, 15), 2))).toBe('2027-01-15')
  })
})

describe('rangeBounds', () => {
  const now = new Date(2026, 8, 28, 22, 30) // Sep 28, late evening

  test.each([
    ['This month', '2026-09-01', '2026-09-28'],
    ['Last month', '2026-08-01', '2026-08-31'],
    ['Last 3 months', '2026-06-28', '2026-09-28'],
    ['Year to date', '2026-01-01', '2026-09-28'],
  ] as const)('%s', (range, start, end) => {
    expect(rangeBounds(range, now)).toEqual({ start, end })
  })

  test('last month from January is December of the previous year', () => {
    expect(rangeBounds('Last month', new Date(2026, 0, 10))).toEqual({ start: '2025-12-01', end: '2025-12-31' })
  })

  test('defaults to today', () => {
    expect(rangeBounds('This month').end).toBe(toISODate(new Date()))
  })
})

describe('dayLabel / shortDate', () => {
  const now = new Date(2026, 8, 28, 23, 45)

  test('today, yesterday, then a plain date', () => {
    expect(dayLabel('2026-09-28', now)).toBe('Today · Mon, Sep 28')
    expect(dayLabel('2026-09-27', now)).toBe('Yesterday · Sun, Sep 27')
    expect(dayLabel('2026-09-26', now)).toBe('Sat, Sep 26')
  })

  test('yesterday is still yesterday across the DST change', () => {
    expect(dayLabel('2026-03-08', new Date(2026, 2, 9, 0, 30))).toBe('Yesterday · Sun, Mar 8')
  })

  test('defaults to today', () => {
    expect(dayLabel(toISODate(new Date()))).toMatch(/^Today · /)
  })

  test('shortDate', () => {
    expect(shortDate('2026-07-04')).toBe('Jul 4')
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-09-28T16:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const MIN = 60_000

  test.each([
    [null, 'never'],
    [ago(20_000), 'just now'],
    [ago(5 * MIN), '5 min ago'],
    [ago(60 * MIN), '1 hour ago'],
    [ago(3 * 60 * MIN), '3 hours ago'],
    [ago(24 * 60 * MIN), '1 day ago'],
    [ago(6 * 24 * 60 * MIN), '6 days ago'],
    ['2026-07-04T16:00:00Z', 'Jul 4'],
  ])('%s → %s', (timestamp, expected) => {
    expect(relativeTime(timestamp, now)).toBe(expected)
  })

  test('defaults to now', () => {
    expect(relativeTime(new Date().toISOString())).toBe('just now')
  })
})

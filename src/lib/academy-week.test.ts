import { describe, expect, it } from 'vitest';
import {
  getAcademyWeekBounds,
  getAcademyWeekYear,
  getPreviousAcademyWeek,
  shouldRunFridayReset,
} from './academy-week';

describe('getAcademyWeekBounds', () => {
  it('starts week on Friday', () => {
    const saturday = new Date('2026-08-15T12:00:00'); // Saturday
    const { weekStart, weekEnd } = getAcademyWeekBounds(saturday);
    expect(weekStart.getDay()).toBe(5); // Friday
    expect(weekEnd.getDay()).toBe(4); // Thursday
  });

  it('contains the input date within bounds', () => {
    const wednesday = new Date('2026-08-19T12:00:00'); // Wednesday
    const { weekStart, weekEnd } = getAcademyWeekBounds(wednesday);
    expect(wednesday.getTime()).toBeGreaterThanOrEqual(weekStart.getTime());
    expect(wednesday.getTime()).toBeLessThanOrEqual(weekEnd.getTime());
  });

  it('resets time to midnight for weekStart', () => {
    const { weekStart } = getAcademyWeekBounds(new Date('2026-08-15T23:59:59'));
    expect(weekStart.getHours()).toBe(0);
    expect(weekStart.getMinutes()).toBe(0);
    expect(weekStart.getSeconds()).toBe(0);
  });
});

describe('getAcademyWeekYear', () => {
  it('returns weekNumber >= 1', () => {
    const w = getAcademyWeekYear(new Date('2026-01-10'));
    expect(w.weekNumber).toBeGreaterThanOrEqual(1);
    expect(w.year).toBe(2026);
  });

  it('formats weekStart and weekEnd as YYYY-MM-DD', () => {
    const w = getAcademyWeekYear(new Date('2026-08-15'));
    expect(w.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(w.weekEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getPreviousAcademyWeek', () => {
  it('returns week start 7 days earlier', () => {
    const prev = getPreviousAcademyWeek(new Date('2026-08-15'));
    const current = getAcademyWeekYear(new Date('2026-08-15'));
    const diffMs = current.weekStartDate.getTime() - prev.weekStartDate.getTime();
    expect(diffMs).toBe(7 * 86400000);
  });
});

describe('shouldRunFridayReset', () => {
  it('returns true when lastReset is null', () => {
    expect(shouldRunFridayReset(null, new Date('2026-08-14T10:00:00'))).toBe(true);
  });

  it('returns false when reset already happened this week', () => {
    const fridayMorning = new Date('2026-08-14T10:00:00');
    expect(shouldRunFridayReset('2026-08-14T05:00:00Z', fridayMorning)).toBe(false);
  });

  it('returns true when last reset was before this Friday', () => {
    const fridayMorning = new Date('2026-08-14T10:00:00');
    expect(shouldRunFridayReset('2026-08-07T10:00:00Z', fridayMorning)).toBe(true);
  });

  it('returns true on Thursday if reset has not run this week', () => {
    // Thursday 13 Aug 2026 is the last day of the academy week that started Fri 7 Aug.
    // If no reset has been recorded, it should return true (reset is due for this week).
    const thursday = new Date(2026, 7, 13, 23, 59, 59); // 13 Aug 2026 23:59:59 local
    expect(shouldRunFridayReset(null, thursday)).toBe(true);
  });
});

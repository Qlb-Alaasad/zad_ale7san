/**
 * Academy week runs Friday 00:00 → Thursday 23:59 (Asia/Riyadh local semantics via client TZ).
 */

export interface AcademyWeek {
  weekNumber: number;
  year: number;
  weekStart: string; // YYYY-MM-DD
  weekEnd: string;
  weekStartDate: Date;
  weekEndDate: Date;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Bounds of the academy week containing `date` (week starts Friday). */
export function getAcademyWeekBounds(date: Date = new Date()): { weekStart: Date; weekEnd: Date } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun … 5=Fri 6=Sat
  const daysSinceFriday = (day + 2) % 7; // Fri=0, Sat=1, … Thu=6
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - daysSinceFriday);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

function firstFridayOfYear(year: number): Date {
  const d = new Date(year, 0, 1);
  d.setHours(0, 0, 0, 0);
  while (d.getDay() !== 5) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export function getAcademyWeekYear(date: Date = new Date()): AcademyWeek {
  const { weekStart, weekEnd } = getAcademyWeekBounds(date);
  const year = weekStart.getFullYear();
  const ff = firstFridayOfYear(year);
  const weekNumber = Math.floor((weekStart.getTime() - ff.getTime()) / (7 * 86400000)) + 1;
  return {
    weekNumber: Math.max(1, weekNumber),
    year,
    weekStart: toDateKey(weekStart),
    weekEnd: toDateKey(weekEnd),
    weekStartDate: weekStart,
    weekEndDate: weekEnd,
  };
}

export function getPreviousAcademyWeek(date: Date = new Date()): AcademyWeek {
  const { weekStart } = getAcademyWeekBounds(date);
  const prevFriday = new Date(weekStart);
  prevFriday.setDate(prevFriday.getDate() - 7);
  return getAcademyWeekYear(prevFriday);
}

/** True when we are on or after this week's Friday 00:00 and reset hasn't run yet. */
export function shouldRunFridayReset(lastResetAt: string | null | undefined, now: Date = new Date()): boolean {
  const { weekStart } = getAcademyWeekBounds(now);
  if (now < weekStart) return false;
  if (!lastResetAt) return true;
  return new Date(lastResetAt) < weekStart;
}

/** @deprecated Use getAcademyWeekYear for Friday-based academy weeks. */
export function getCurrentWeekYear(): { weekNumber: number; year: number } {
  const w = getAcademyWeekYear();
  return { weekNumber: w.weekNumber, year: w.year };
}

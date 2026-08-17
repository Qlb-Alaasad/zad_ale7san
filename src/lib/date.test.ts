import { describe, expect, it } from 'vitest';
import { formatDistanceToArabic, formatDateArabic, formatTimeArabic } from './date';

describe('formatDistanceToArabic', () => {
  it('returns "الآن" for very recent dates', () => {
    const now = new Date().toISOString();
    expect(formatDistanceToArabic(now)).toBe('الآن');
  });

  it('returns minutes for recent past', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
    expect(formatDistanceToArabic(fiveMinAgo)).toBe('قبل 5 دقيقة');
  });

  it('returns hours for same day', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
    expect(formatDistanceToArabic(twoHoursAgo)).toBe('قبل 2 ساعة');
  });

  it('returns days for recent days', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    expect(formatDistanceToArabic(threeDaysAgo)).toBe('قبل 3 يوم');
  });
});

describe('formatDateArabic', () => {
  it('returns "غير محدد" for null/undefined', () => {
    expect(formatDateArabic(null)).toBe('غير محدد');
    expect(formatDateArabic(undefined)).toBe('غير محدد');
  });

  it('formats a valid ISO date', () => {
    const result = formatDateArabic('2026-08-15T10:00:00Z');
    // Arabic-EG locale may use Eastern Arabic numerals (٢٠٢٦) or Western (2026)
    expect(result).toMatch(/٢٠٢٦|2026/);
  });
});

describe('formatTimeArabic', () => {
  it('returns empty string for null', () => {
    expect(formatTimeArabic(null)).toBe('');
  });

  it('formats time from ISO string', () => {
    const result = formatTimeArabic('2026-08-15T14:30:00Z');
    expect(result).toContain(':');
  });
});

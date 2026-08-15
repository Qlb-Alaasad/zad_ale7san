import { describe, expect, it } from 'vitest';
import { resolvePointsImpact } from './student-notes';

describe('resolvePointsImpact', () => {
  it('returns 0 when excused', () => {
    expect(resolvePointsImpact({ excused: true, points_impact: -10 })).toBe(0);
  });

  it('returns explicit points_impact when provided', () => {
    expect(resolvePointsImpact({ points_impact: -3 })).toBe(-3);
  });

  it('returns -5 for absence type by default', () => {
    expect(resolvePointsImpact({ note_type: 'absence' })).toBe(-5);
  });

  it('returns 0 for general type by default', () => {
    expect(resolvePointsImpact({ note_type: 'general' })).toBe(0);
  });
});

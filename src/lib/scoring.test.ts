import { describe, expect, it } from 'vitest';
import {
  computeCoursePoints,
  computeGlobalScoreAdjustments,
  computeStarFills,
  computeStudentScore,
  filterEvaluationsForStudent,
} from './scoring';
import type { Category, Evaluation, StudentNote } from './types';

const basePoints = 100;
const courseA = 'course-a';
const courseB = 'course-b';

function note(overrides: Partial<StudentNote> & Pick<StudentNote, 'id' | 'student_id'>): StudentNote {
  return {
    course_id: null,
    session_id: null,
    note: 'test',
    note_type: 'supervisor',
    points_impact: 0,
    excused: false,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function evaluation(overrides: Partial<Evaluation> & Pick<Evaluation, 'id' | 'student_id' | 'category_id'>): Evaluation {
  return {
    course_id: null,
    week_number: 1,
    year: 2026,
    points_deducted: 0,
    note: '',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ========== EXISTING TESTS PRESERVED ==========

describe('grade recalculation from feedback notes', () => {
  it('restores full score when a global deduction note is removed', () => {
    const withDeduction = [note({ id: 'n1', student_id: 's1', points_impact: -5 })];
    const withoutDeduction: StudentNote[] = [];

    const before = computeStudentScore([courseA], basePoints, [], withDeduction, [], true);
    const after = computeStudentScore([courseA], basePoints, [], withoutDeduction, [], true);

    expect(before.pct).toBe(95);
    expect(after.pct).toBe(100);
  });

  it('updates score when a course-scoped deduction note changes', () => {
    const notes = [note({ id: 'n1', student_id: 's1', course_id: courseA, points_impact: -5 })];
    const updated = [note({ id: 'n1', student_id: 's1', course_id: courseA, points_impact: -2 })];

    const initial = computeStudentScore([courseA], basePoints, [], notes, [], true);
    const revised = computeStudentScore([courseA], basePoints, [], updated, [], true);

    expect(initial.pct).toBe(95);
    expect(revised.pct).toBe(98);
  });

  it('ignores excused notes when recalculating', () => {
    const notes = [note({ id: 'n1', student_id: 's1', points_impact: -5, excused: true })];
    const score = computeStudentScore([courseA], basePoints, [], notes, [], true);
    expect(score.pct).toBe(100);
  });

  it('applies global deductions once across multiple enrolled courses', () => {
    const notes = [note({ id: 'n1', student_id: 's1', points_impact: -10 })];
    const score = computeStudentScore([courseA, courseB], basePoints, [], notes, [], true);
    expect(score.pct).toBe(90);
  });

  it('combines course and global adjustments', () => {
    const notes = [
      note({ id: 'n1', student_id: 's1', course_id: courseA, points_impact: -5 }),
      note({ id: 'n2', student_id: 's1', points_impact: -5 }),
    ];
    const score = computeStudentScore([courseA, courseB], basePoints, [], notes, [], true);
    expect(score.pct).toBe(93);
  });
});

describe('computeGlobalScoreAdjustments', () => {
  it('sums global evaluation deductions and note impacts', () => {
    const evals = [evaluation({ id: 'e1', student_id: 's1', category_id: 'c1', points_deducted: 3 })];
    const notes = [note({ id: 'n1', student_id: 's1', points_impact: -5 })];
    expect(computeGlobalScoreAdjustments(evals, notes)).toBe(-8);
  });
});

describe('computeCoursePoints', () => {
  it('only applies notes scoped to the course', () => {
    const notes = [
      note({ id: 'n1', student_id: 's1', course_id: courseA, points_impact: -5 }),
      note({ id: 'n2', student_id: 's1', course_id: courseB, points_impact: -10 }),
    ];
    expect(computeCoursePoints(courseA, basePoints, [], notes)).toBe(95);
    expect(computeCoursePoints(courseB, basePoints, [], notes)).toBe(90);
  });
});

describe('filterEvaluationsForStudent', () => {
  const hifzCategory: Category = {
    id: 'hifz',
    name: 'Hifz',
    description: '',
    max_points: 25,
    is_hifz: true,
    created_at: '',
  };
  const generalCategory: Category = {
    id: 'general',
    name: 'General',
    description: '',
    max_points: 25,
    is_hifz: false,
    created_at: '',
  };

  it('excludes hifz evaluations for non-hifz students', () => {
    const evals = [
      evaluation({ id: 'e1', student_id: 's1', category_id: 'hifz', points_deducted: 5 }),
      evaluation({ id: 'e2', student_id: 's1', category_id: 'general', points_deducted: 2 }),
    ];
    const filtered = filterEvaluationsForStudent(evals, [hifzCategory, generalCategory], false);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].category_id).toBe('general');
  });
});

describe('computeStarFills', () => {
  it('returns full stars at zero deductions', () => {
    expect(computeStarFills(0, 25)).toEqual([1, 1, 1, 1, 1]);
  });

  it('returns depleted stars when all points are deducted', () => {
    const fills = computeStarFills(25, 25);
    expect(fills[0]).toBe(0);
    expect(fills.every((fill) => fill <= 0)).toBe(true);
  });
});

// ========== NEW EDGE-CASE COVERAGE ==========

describe('computeStarFills edge cases', () => {
  it('handles negative deductions as zero (full marks)', () => {
    expect(computeStarFills(-5, 25)).toEqual([1, 1, 1, 1, 1]);
  });

  it('handles deductions exceeding maxPoints as total depletion', () => {
    const fills = computeStarFills(50, 25);
    expect(fills.every((f) => f === 0)).toBe(true);
  });

  it('handles custom maxPoints (e.g. 10-point scale)', () => {
    const fills = computeStarFills(2, 10);
    // earned = 8, pointsPerStar = 2
    expect(fills).toEqual([1, 1, 1, 1, 0]);
  });

  it('handles fractional fills precisely', () => {
    const fills = computeStarFills(12, 25); // earned = 13, perStar = 5
    expect(fills[0]).toBe(1);
    expect(fills[1]).toBe(1);
    expect(fills[2]).toBeCloseTo(0.6, 5);
    expect(fills[3]).toBe(0);
  });
});

describe('computeStudentScore edge cases', () => {
  it('returns 0 points and 0 pct when basePoints is 0 (no division by zero)', () => {
    const score = computeStudentScore([courseA], 0, [], [], [], true);
    expect(score.points).toBe(0);
    expect(score.pct).toBe(0);
  });

  it('returns basePoints when no courses and no adjustments', () => {
    const score = computeStudentScore([], basePoints, [], [], [], true);
    expect(score.points).toBe(basePoints);
    expect(score.pct).toBe(100);
  });

  it('caps negative scores at 0', () => {
    const notes = [note({ id: 'n1', student_id: 's1', points_impact: -500 })];
    const score = computeStudentScore([], basePoints, [], notes, [], true);
    expect(score.points).toBe(0);
    expect(score.pct).toBe(0);
  });

  it('averages multiple course points correctly', () => {
    const evals = [
      evaluation({ id: 'e1', student_id: 's1', category_id: 'c1', course_id: courseA, points_deducted: 10 }),
      evaluation({ id: 'e2', student_id: 's1', category_id: 'c2', course_id: courseB, points_deducted: 20 }),
    ];
    const score = computeStudentScore([courseA, courseB], basePoints, evals, [], [], true);
    // courseA = 90, courseB = 80, avg = 85
    expect(score.points).toBe(85);
    expect(score.pct).toBe(85);
  });
});

describe('computeCoursePoints edge cases', () => {
  it('ignores evaluations scoped to other courses', () => {
    const evals = [
      evaluation({ id: 'e1', student_id: 's1', category_id: 'c1', course_id: courseA, points_deducted: 10 }),
      evaluation({ id: 'e2', student_id: 's1', category_id: 'c2', course_id: courseB, points_deducted: 20 }),
    ];
    expect(computeCoursePoints(courseA, basePoints, evals, [])).toBe(90);
  });

  it('rounds fractional results', () => {
    const notes = [note({ id: 'n1', student_id: 's1', course_id: courseA, points_impact: 0.6 })];
    expect(computeCoursePoints(courseA, basePoints, [], notes)).toBe(101);
  });
});

describe('computeGlobalScoreAdjustments edge cases', () => {
  it('ignores course-scoped evaluations and notes', () => {
    const evals = [
      evaluation({ id: 'e1', student_id: 's1', category_id: 'c1', course_id: courseA, points_deducted: 10 }),
    ];
    const notes = [note({ id: 'n1', student_id: 's1', course_id: courseA, points_impact: -5 })];
    expect(computeGlobalScoreAdjustments(evals, notes)).toBe(0);
  });

  it('treats missing points_deducted as 0', () => {
    const evals = [
      { ...evaluation({ id: 'e1', student_id: 's1', category_id: 'c1' }), points_deducted: undefined as unknown as number },
    ];
    expect(computeGlobalScoreAdjustments(evals, [])).toBe(0);
  });
});

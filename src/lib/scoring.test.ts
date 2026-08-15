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

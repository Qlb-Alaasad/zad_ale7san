import type { Category, Evaluation, StudentNote } from './types';

export { getAcademyWeekYear, getCurrentWeekYear, getPreviousAcademyWeek } from './academy-week';

/**
 * Compute the fill ratio (0..1) for each of 5 stars given points_deducted and max_points.
 * points = max_points - points_deducted (what the student earned).
 * 5 points = 1 star. We compute exact fractional fills with no rounding.
 *
 * Returns an array of 5 numbers (0..1), one per star in order.
 */
export function computeStarFills(pointsDeducted: number, maxPoints: number = 25): number[] {
  const earned = Math.max(0, maxPoints - pointsDeducted);
  const pointsPerStar = maxPoints / 5;
  const fills: number[] = [];
  let remaining = earned;
  for (let i = 0; i < 5; i++) {
    const fill = Math.min(1, remaining / pointsPerStar);
    fills.push(fill);
    remaining -= pointsPerStar;
  }
  return fills;
}

/** Exclude Hifz category deductions when student is not in a Hifz group. */
export function filterEvaluationsForStudent(
  evaluations: Evaluation[],
  categories: Category[],
  inHifzGroup: boolean
): Evaluation[] {
  if (inHifzGroup) return evaluations;
  const hifzIds = new Set(categories.filter((c) => c.is_hifz).map((c) => c.id));
  return evaluations.filter((e) => !hifzIds.has(e.category_id));
}

/**
 * Compute course points excluding Hifz-only evaluations for non-Hifz students.
 */
// In computeStudentScore (lines 46-61)
export function computeStudentScore(
  courseIds: string[],
  basePoints: number,
  evaluations: Evaluation[],
  notes: StudentNote[],
  categories: Category[],
  inHifzGroup: boolean
): { points: number; pct: number } {
  const safeBase = Math.max(0, basePoints || 100);
  const filteredEvals = filterEvaluationsForStudent(evaluations, categories, inHifzGroup);
  if (courseIds.length === 0) {
    const globalOnly = computeGlobalScoreAdjustments(filteredEvals, notes);
    const points = Math.max(0, Math.round(safeBase + globalOnly));
    return { points, pct: safeBase > 0 ? Math.round((points / safeBase) * 100) : 0 };
  }
  const avg =
    courseIds.reduce(
      (sum, cid) => sum + computeCoursePoints(cid, safeBase, filteredEvals, notes),
      0
    ) / courseIds.length;
  const globalAdjustments = computeGlobalScoreAdjustments(filteredEvals, notes);
  const points = Math.max(0, Math.round(avg + globalAdjustments));
  return { points, pct: safeBase > 0 ? Math.round((points / safeBase) * 100) : 0 };
}

/**
 * Build a map of categoryId -> evaluation for the current week.
 */
export function indexEvaluationsByCategory(evals: Evaluation[]): Record<string, Evaluation> {
  const map: Record<string, Evaluation> = {};
  for (const e of evals) {
    map[e.category_id] = e;
  }
  return map;
}

/**
 * Aggregate evaluations for a given week into per-category star fills.
 */
export function getCategoryStars(
  categories: Category[],
  evaluations: Evaluation[]
): { category: Category; fills: number[]; pointsDeducted: number }[] {
  const evalMap = indexEvaluationsByCategory(evaluations);
  return categories.map((cat) => {
    const ev = evalMap[cat.id];
    const deducted = ev?.points_deducted ?? 0;
    return { category: cat, fills: computeStarFills(deducted, cat.max_points), pointsDeducted: deducted };
  });
}

/**
 * Compute a student's current points for a specific course.
 * Starts from basePoints, subtracts course-scoped evaluation deductions,
 * and applies course-scoped student_notes points_impact (unless excused).
 * Global adjustments (null course_id) are applied in computeStudentScore.
 */
export function computeCoursePoints(
  courseId: string,
  basePoints: number,
  evaluations: Evaluation[],
  notes: StudentNote[]
): number {
  const evalDeduction = evaluations
    .filter((e) => e.course_id === courseId)
    .reduce((sum, e) => sum + (e.points_deducted || 0), 0);

  const noteImpact = notes
    .filter((n) => n.course_id === courseId && !n.excused)
    .reduce((sum, n) => sum + (n.points_impact || 0), 0);

  const points = basePoints - evalDeduction + noteImpact;
  return Math.max(0, Math.round(points));
}

/** Evaluations and notes without course_id apply once to the overall score. */
export function computeGlobalScoreAdjustments(
  evaluations: Evaluation[],
  notes: StudentNote[]
): number {
  const globalEvalDeduction = evaluations
    .filter((e) => !e.course_id)
    .reduce((sum, e) => sum + (e.points_deducted || 0), 0);

  const globalNoteImpact = notes
    .filter((n) => !n.course_id && !n.excused)
    .reduce((sum, n) => sum + (n.points_impact || 0), 0);

  return -globalEvalDeduction + globalNoteImpact;
}

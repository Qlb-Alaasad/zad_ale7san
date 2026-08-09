import type { Category, Evaluation, StudentNote } from './types';

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

/**
 * Get the current week number and year for evaluation scoping.
 */
export function getCurrentWeekYear(): { weekNumber: number; year: number } {
  const now = new Date();
  const year = now.getFullYear();
  const onejan = new Date(year, 0, 1);
  const week = Math.ceil(((now.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return { weekNumber: week, year };
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
 * Starts from basePoints, subtracts deductions from evaluations (for that course),
 * and applies points_impact from student_notes linked to that course (unless excused).
 * Returns a value clamped to >= 0.
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

import { supabase } from './supabase';
import { getAcademyWeekYear, getPreviousAcademyWeek, shouldRunFridayReset } from './academy-week';
import type { Evaluation, StudentNote, Attendance, Profile, EvaluationHistoryRecord } from './types';

export async function fetchStudentHistory(
  studentId: string,
  weekNumber?: number,
  year?: number
): Promise<EvaluationHistoryRecord[]> {
  let q = supabase
    .from('student_evaluation_history')
    .select('*')
    .eq('student_id', studentId)
    .order('week_start', { ascending: false });

  if (weekNumber != null && year != null) {
    q = q.eq('week_number', weekNumber).eq('year', year);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[history] fetchStudentHistory failed:', error.message);
    return [];
  }
  return (data as EvaluationHistoryRecord[]) || [];
}

async function archiveWeekForStudent(
  student: Profile,
  week: ReturnType<typeof getPreviousAcademyWeek>
): Promise<void> {
  const { data: existing } = await supabase
    .from('student_evaluation_history')
    .select('id')
    .eq('student_id', student.id)
    .eq('week_number', week.weekNumber)
    .eq('year', week.year)
    .maybeSingle();

  if (existing) return;

  const weekStartIso = week.weekStartDate.toISOString();
  const weekEndIso = week.weekEndDate.toISOString();

  const [{ data: evals }, { data: notes }, { data: att }] = await Promise.all([
    supabase.from('evaluations').select('*').eq('student_id', student.id).eq('week_number', week.weekNumber).eq('year', week.year),
    supabase.from('student_notes').select('*').eq('student_id', student.id).gte('created_at', weekStartIso).lte('created_at', weekEndIso),
    supabase.from('attendance').select('*, session:sessions(*)').eq('student_id', student.id).gte('created_at', weekStartIso).lte('created_at', weekEndIso),
  ]);

  if (!(evals?.length) && !(notes?.length) && !(att?.length)) return;

  await supabase.from('student_evaluation_history').insert({
    student_id: student.id,
    week_number: week.weekNumber,
    year: week.year,
    week_start: week.weekStart,
    week_end: week.weekEnd,
    evaluations: evals || [],
    notes: notes || [],
    attendance: att || [],
    quran_progress: student.quran_progress,
    current_module: student.current_module,
  });
}

/**
 * On each app load (admin): if Friday 00:00 has passed since last reset,
 * archive the previous academy week and clear its live evaluation rows.
 */
export async function maybeRunWeeklyEvaluationReset(): Promise<boolean> {
  const { data: settings, error: settingsErr } = await supabase
    .from('settings')
    .select('id, last_weekly_reset_at')
    .eq('id', 1)
    .maybeSingle();

  if (settingsErr) {
    console.error('[weekly-reset] settings fetch failed:', settingsErr.message);
    return false;
  }

  const lastReset = settings?.last_weekly_reset_at as string | null | undefined;
  if (!shouldRunFridayReset(lastReset)) return false;

  const prevWeek = getPreviousAcademyWeek();
  console.info('[weekly-reset] Archiving academy week', prevWeek);

  const { data: students, error: studentsErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'student');

  if (studentsErr) {
    console.error('[weekly-reset] students fetch failed:', studentsErr.message);
    return false;
  }

  for (const student of (students as Profile[]) || []) {
    await archiveWeekForStudent(student, prevWeek);
  }

  const { error: delErr } = await supabase
    .from('evaluations')
    .delete()
    .eq('week_number', prevWeek.weekNumber)
    .eq('year', prevWeek.year);

  if (delErr) {
    console.error('[weekly-reset] delete evaluations failed:', delErr.message);
    return false;
  }

  const currentWeekStart = getAcademyWeekYear().weekStartDate.toISOString();
  await supabase.from('settings').update({ last_weekly_reset_at: currentWeekStart }).eq('id', 1);

  console.info('[weekly-reset] Complete for week', prevWeek.weekNumber, prevWeek.year);
  return true;
}

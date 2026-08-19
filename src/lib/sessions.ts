import { supabase } from './supabase';
import type { Session, SessionScore, SessionScoreRollup } from './types';

/*
 * Sprint 1 — Group-centric sessions.
 * Sessions belong to a class circle (sessions.group_id), are generated from
 * the group's recurring weekly schedule, support a per-session substitute
 * teacher override, and collect per-session quick scores (session_scores)
 * that roll up into the weekly evaluation.
 */

/** JS weekday numbers → Arabic labels (0=Sunday … 6=Saturday). */
export const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function formatScheduleDays(days: number[] | null | undefined): string {
  if (!days || days.length === 0) return '—';
  return [...days].sort((a, b) => a - b).map((d) => DAY_NAMES_AR[d] ?? String(d)).join('، ');
}

export type GroupSessionInsert = {
  group_id: string;
  title: string;
  description?: string;
  scheduled_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string;
  category_id?: string | null;
  course_id?: string | null;
};

/** Sessions for a group, newest first. */
export async function listGroupSessions(groupId: string): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('group_id', groupId)
    .order('scheduled_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[sessions] listGroupSessions failed:', error.message);
    return [];
  }
  return (data as Session[]) || [];
}

/** All sessions across a teacher's classes (plus sessions they substitute). */
export async function listTeacherSessions(groupIds: string[], teacherId: string): Promise<Session[]> {
  if (groupIds.length === 0) return [];
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .or(`group_id.in.(${groupIds.join(',')}),substitute_teacher_id.eq.${teacherId}`)
    .order('scheduled_date', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('[sessions] listTeacherSessions failed:', error.message);
    return [];
  }
  return (data as Session[]) || [];
}

/** Manually schedule a single group session. */
export async function createGroupSession(input: GroupSessionInsert): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      group_id: input.group_id,
      title: input.title,
      description: input.description ?? '',
      session_type: 'class',
      scheduled_date: input.scheduled_date ?? null,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
      location: input.location ?? '',
      category_id: input.category_id ?? null,
      course_id: input.course_id ?? null,
      is_active: false,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[sessions] createGroupSession failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id as string | undefined };
}

/**
 * Auto-generate the week's sessions from the group's recurring schedule.
 * weekStart must be the academy week's Friday (YYYY-MM-DD). Returns count created.
 */
export async function generateWeekSessions(
  groupId: string,
  weekStart: string
): Promise<{ ok: boolean; created: number; error?: string }> {
  const { data, error } = await supabase.rpc('generate_group_sessions', {
    p_group_id: groupId,
    p_week_start: weekStart,
  });

  if (error) {
    console.error('[sessions] generateWeekSessions failed:', error.message);
    return { ok: false, created: 0, error: error.message };
  }
  return { ok: true, created: (data as number) ?? 0 };
}

/** Per-session substitute override — does NOT change the group's primary teacher. */
export async function setSessionSubstitute(sessionId: string, teacherId: string | null): Promise<boolean> {
  const { error } = await supabase
    .from('sessions')
    .update({ substitute_teacher_id: teacherId })
    .eq('id', sessionId);
  if (error) {
    console.error('[sessions] setSessionSubstitute failed:', error.message);
    return false;
  }
  return true;
}

/** Open a session for check-in (QR becomes valid; late threshold starts now). */
export async function startSessionNow(sessionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('sessions')
    .update({ is_active: true, start_time: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) {
    console.error('[sessions] startSessionNow failed:', error.message);
    return false;
  }
  return true;
}

/** Close a session (QR stops being valid). */
export async function closeSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('sessions')
    .update({ is_active: false, end_time: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) {
    console.error('[sessions] closeSession failed:', error.message);
    return false;
  }
  return true;
}

/** Upsert a per-student quick score for a session (0–5 per metric). */
export async function upsertSessionScore(input: {
  session_id: string;
  student_id: string;
  attendance_score?: number | null;
  recitation_score?: number | null;
  behavior_score?: number | null;
  note?: string;
}): Promise<boolean> {
  const { error } = await supabase.from('session_scores').upsert(
    {
      session_id: input.session_id,
      student_id: input.student_id,
      attendance_score: input.attendance_score ?? null,
      recitation_score: input.recitation_score ?? null,
      behavior_score: input.behavior_score ?? null,
      note: input.note ?? '',
      // teacher_id is auto-stamped by trg_session_scores_meta.
    },
    { onConflict: 'session_id,student_id' }
  );
  if (error) {
    console.error('[sessions] upsertSessionScore failed:', error.message);
    return false;
  }
  return true;
}

export async function listSessionScores(sessionId: string): Promise<SessionScore[]> {
  const { data, error } = await supabase
    .from('session_scores')
    .select('*')
    .eq('session_id', sessionId);

  if (error) {
    console.error('[sessions] listSessionScores failed:', error.message);
    return [];
  }
  return (data as SessionScore[]) || [];
}

/** Weekly rollup of a student's per-session scores (feeds Friday evaluation). */
export async function getStudentWeeklyRollup(
  studentId: string,
  weekStart: string,
  weekEnd: string
): Promise<SessionScoreRollup | null> {
  const { data, error } = await supabase.rpc('get_student_session_rollup', {
    p_student_id: studentId,
    p_week_start: weekStart,
    p_week_end: weekEnd,
  });

  if (error) {
    console.error('[sessions] getStudentWeeklyRollup failed:', error.message);
    return null;
  }
  return data as SessionScoreRollup;
}

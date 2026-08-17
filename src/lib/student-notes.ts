import { supabase } from './supabase';
import type { NoteType, StudentNote } from './types';

export type StudentNoteInput = {
  student_id: string;
  note: string;
  note_type: NoteType;
  course_id?: string | null;
  session_id?: string | null;
  category_id?: string | null;
  points_impact?: number;
  excused?: boolean;
};

export type StudentNoteUpdate = Partial<Omit<StudentNoteInput, 'student_id'>>;

export function resolvePointsImpact(input: { points_impact?: number; excused?: boolean; note_type?: NoteType }): number {
  if (input.excused) return 0;
  if (input.points_impact !== undefined) return input.points_impact;
  if (input.note_type === 'absence') return -5;
  return 0;
}

export async function listStudentNotes(studentId: string): Promise<StudentNote[]> {
  const { data, error } = await supabase
    .from('student_notes')
    .select('*, course:courses(*)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[student-notes] list failed:', error.message);
    return [];
  }

  return (data as StudentNote[]) || [];
}

export async function createStudentNote(
  input: StudentNoteInput
): Promise<{ data: StudentNote | null; error: string | null }> {
  const points_impact = resolvePointsImpact(input);
  const { data, error } = await supabase
    .from('student_notes')
    .insert({
      student_id: input.student_id,
      note: input.note.trim(),
      note_type: input.note_type,
      course_id: input.course_id ?? null,
      session_id: input.session_id ?? null,
      category_id: input.category_id ?? null,
      points_impact,
      excused: input.excused ?? false,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[student-notes] create failed:', error.message);
    return { data: null, error: error.message };
  }

  return { data: data as StudentNote, error: null };
}

export async function updateStudentNote(
  id: string,
  updates: StudentNoteUpdate
): Promise<{ data: StudentNote | null; error: string | null }> {
  const payload: Record<string, unknown> = {};

  if (updates.note !== undefined) payload.note = updates.note.trim();
  if (updates.note_type !== undefined) payload.note_type = updates.note_type;
  if (updates.course_id !== undefined) payload.course_id = updates.course_id;
  if (updates.session_id !== undefined) payload.session_id = updates.session_id;
  if (updates.category_id !== undefined) payload.category_id = updates.category_id;
  if (updates.excused !== undefined) payload.excused = updates.excused;

  if (updates.points_impact !== undefined || updates.excused !== undefined || updates.note_type !== undefined) {
    payload.points_impact = resolvePointsImpact({
      points_impact: updates.points_impact,
      excused: updates.excused,
      note_type: updates.note_type,
    });
  }

  const { data, error } = await supabase
    .from('student_notes')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[student-notes] update failed:', error.message);
    return { data: null, error: error.message };
  }

  return { data: data as StudentNote, error: null };
}

export async function deleteStudentNote(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('student_notes').delete().eq('id', id);

  if (error) {
    console.error('[student-notes] delete failed:', error.message);
    return { error: error.message };
  }

  return { error: null };
}

import { useCallback, useEffect, useState } from 'react';
import { StickyNote, Plus, Trash2, Save, Users } from 'lucide-react';
import { createNotification } from '@/lib/notifications';
import { formatDateArabic } from '@/lib/date';
import { createStudentNote, deleteStudentNote } from '@/lib/student-notes';
import { Loading, EmptyState, Badge } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { getTeacherStudentIds } from '@/lib/classes';
import { supabase } from '@/lib/supabase';
import type { Profile, StudentNote, NoteType } from '@/lib/types';

interface TeacherNotesTabProps {
  teacherId: string;
}

export function TeacherNotesTab({ teacherId }: TeacherNotesTabProps) {
  const [students, setStudents] = useState<Profile[]>([]);
  const [notes, setNotes] = useState<(StudentNote & { student?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('supervisor');
  const [pointsImpact, setPointsImpact] = useState('0');
  const [showForm, setShowForm] = useState(false);

  const studentMap = Object.fromEntries(students.map((s) => [s.id, s]));

  const loadStudents = useCallback(async () => {
    const ids = await getTeacherStudentIds(teacherId);
    if (ids.length === 0) {
      setStudents([]);
      return;
    }
    const { data } = await supabase.from('profiles').select('*').in('id', ids).order('full_name');
    setStudents((data as Profile[]) || []);
  }, [teacherId]);

  const loadNotes = useCallback(async () => {
    if (students.length === 0) {
      setNotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const studentIds = students.map((s) => s.id);
    const { data, error } = await supabase
      .from('student_notes')
      .select('*')
      .in('student_id', studentIds)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[TeacherNotes] load failed:', error.message);
      setNotes([]);
    } else {
      setNotes(
        ((data as StudentNote[]) || []).map((n) => ({
          ...n,
          student: studentMap[n.student_id],
        }))
      );
    }
    setLoading(false);
  }, [students, studentMap]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const addNote = async () => {
    if (!selectedStudent || !noteText.trim()) return;
    const impact = parseInt(pointsImpact, 10) || 0;
    const { error } = await createStudentNote({
      student_id: selectedStudent,
      note: noteText.trim(),
      note_type: noteType,
      points_impact: noteType === 'absence' ? -5 : impact,
    });
    if (error) {
      alert(`فشل إضافة الملاحظة: ${error}`);
      return;
    }
    await createNotification(
      selectedStudent,
      noteType === 'absence' ? 'تنبيه غياب' : 'ملاحظة من المعلّم',
      noteText.trim(),
      'note'
    );
    setNoteText('');
    setPointsImpact('0');
    setSelectedStudent('');
    setShowForm(false);
    loadNotes();
  };

  const deleteNote = async (id: string) => {
    if (!confirm('حذف هذه الملاحظة؟')) return;
    const { error } = await deleteStudentNote(id);
    if (error) {
      alert(`فشل حذف الملاحظة: ${error}`);
      return;
    }
    loadNotes();
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-forest-900">ملاحظات وتنبيهات الطلاب</h3>
          <p className="text-sm text-charcoal-500">إضافة ملاحظات وتنبيهات لطلاب شعبك فقط</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn btn-gold text-sm" disabled={students.length === 0}>
          <Plus className="w-4 h-4" />
          ملاحظة جديدة
        </button>
      </div>

      {students.length === 0 ? (
        <EmptyState icon={<Users className="w-8 h-8" />} title="لا يوجد طلاب في شعبك" subtitle="تواصل مع المدير لتعيينك لشعبة" />
      ) : notes.length === 0 ? (
        <EmptyState icon={<StickyNote className="w-8 h-8" />} title="لا توجد ملاحظات" subtitle="أضف ملاحظة أو تنبيهاً لأحد طلابك" />
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="card flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <p className="font-bold text-forest-900">{n.student?.full_name || 'طالب'}</p>
                  <Badge color={n.note_type === 'absence' ? 'red' : 'forest'}>{n.note_type}</Badge>
                  {n.points_impact !== 0 && !n.excused && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${n.points_impact < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {n.points_impact > 0 ? `+${n.points_impact}` : n.points_impact} نقطة
                    </span>
                  )}
                </div>
                <p className="text-sm text-charcoal-600">{n.note}</p>
                <p className="text-xs text-charcoal-400 mt-1">{formatDateArabic(n.created_at)}</p>
              </div>
              <button onClick={() => deleteNote(n.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal open onClose={() => setShowForm(false)} title="ملاحظة / تنبيه">
          <div className="space-y-4">
            <div>
              <label className="label">الطالب</label>
              <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} className="input">
                <option value="">— اختر الطالب —</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">النوع</label>
              <select value={noteType} onChange={(e) => setNoteType(e.target.value as NoteType)} className="input">
                <option value="supervisor">ملاحظة إشراف</option>
                <option value="absence">تنبيه غياب</option>
                <option value="general">عامة</option>
                <option value="custom">مخصصة</option>
              </select>
            </div>
            {noteType !== 'absence' && (
              <div>
                <label className="label">تأثير النقاط (سالب = خصم)</label>
                <input
                  type="number"
                  value={pointsImpact}
                  onChange={(e) => setPointsImpact(e.target.value)}
                  className="input"
                />
              </div>
            )}
            <div>
              <label className="label">النص</label>
              <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} className="input min-h-[100px]" placeholder="اكتب الملاحظة..." />
            </div>
            <button onClick={addNote} disabled={!selectedStudent || !noteText.trim()} className="btn btn-primary w-full">
              <Save className="w-4 h-4" />
              حفظ
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

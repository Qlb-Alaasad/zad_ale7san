import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, Calendar, ClipboardCheck, GraduationCap, QrCode, Play, Square,
  StickyNote, RefreshCw, UserPlus, Clock, LayoutDashboard, Star, Bell, Search,
} from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { DashboardLayout, type DashboardNavItem } from '@/components/DashboardLayout';
import { Modal } from '@/components/Modal';
import { Loading, EmptyState, Badge } from '@/components/ui';
import {
  getTeacherClassesWithRoles,
  getClassStudents,
  getClassTeachersDetailed,
  CLASS_ASSIGNMENT_ROLE_LABELS,
  type ClassTeacherDetail,
} from '@/lib/classes';
import { generateQrPayload } from '@/lib/qr';
import { createStudentNote, listStudentNotes, NOTE_VISIBILITY_LABELS } from '@/lib/student-notes';
import { insertTasksForStudents, TASK_STATUS_LABELS, TASK_STATUS_COLORS, normalizeTaskStatus } from '@/lib/tasks';
import { getAcademyWeekYear } from '@/lib/academy-week';
import { formatDateArabic } from '@/lib/date';
import { createNotification } from '@/lib/notifications';
import {
  formatScheduleDays,
  listGroupSessions,
  generateWeekSessions,
  startSessionNow,
  closeSession,
  setSessionSubstitute,
  upsertSessionScore,
  listSessionScores,
} from '@/lib/sessions';
import type {
  StudentGroup, Profile, Session, Attendance, AttendanceStatus, Task,
  StudentNote, NoteType, NoteVisibility, ClassAssignmentRole, SessionScore,
} from '@/lib/types';

type TeacherTab = 'overview' | 'sessions' | 'students' | 'tasks' | 'notes';

interface ClassEntry {
  classInfo: StudentGroup;
  role: ClassAssignmentRole;
}

const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  supervisor: 'ملاحظة مشرف',
  absence: 'غياب',
  general: 'عامة',
  excuse: 'عذر',
  custom: 'مخصصة',
};

export default function TeacherDashboard() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<TeacherTab>('overview');
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, Profile[]>>({});

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const entries = await getTeacherClassesWithRoles(profile.id);
    setClasses(entries);
    const roster: Record<string, Profile[]> = {};
    for (const entry of entries) {
      roster[entry.classInfo.id] = await getClassStudents(entry.classInfo.id);
    }
    setStudentsByClass(roster);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  /** Unique students across all my classes (id → profile + class names). */
  const allStudents = useMemo(() => {
    const map = new Map<string, { profile: Profile; classNames: string[] }>();
    for (const entry of classes) {
      for (const s of studentsByClass[entry.classInfo.id] || []) {
        const existing = map.get(s.id);
        if (existing) existing.classNames.push(entry.classInfo.name);
        else map.set(s.id, { profile: s, classNames: [entry.classInfo.name] });
      }
    }
    return [...map.values()];
  }, [classes, studentsByClass]);

  const navItems: DashboardNavItem[] = [
    { id: 'overview', label: 'نظرة عامة', icon: <LayoutDashboard className="w-5 h-5" />, onClick: () => setTab('overview'), active: tab === 'overview' },
    { id: 'sessions', label: 'الحصص', icon: <Calendar className="w-5 h-5" />, onClick: () => setTab('sessions'), active: tab === 'sessions' },
    { id: 'students', label: 'الطلاب', icon: <GraduationCap className="w-5 h-5" />, onClick: () => setTab('students'), active: tab === 'students' },
    { id: 'tasks', label: 'المهام', icon: <ClipboardCheck className="w-5 h-5" />, onClick: () => setTab('tasks'), active: tab === 'tasks' },
    { id: 'notes', label: 'الملاحظات', icon: <StickyNote className="w-5 h-5" />, onClick: () => setTab('notes'), active: tab === 'notes' },
    { id: 'notifications', label: 'الإشعارات', icon: <Bell className="w-5 h-5" /> },
  ];

  if (loading) {
    return <DashboardLayout navItems={navItems}><Loading /></DashboardLayout>;
  }

  return (
    <DashboardLayout navItems={navItems}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-forest-900">بوابة المشرف</h1>
        <p className="text-charcoal-500 text-sm mt-1">مرحباً {profile?.full_name} — إدارة الشُعب والحصص والطلاب</p>
      </div>

      {classes.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users className="w-8 h-8" />}
            title="لا توجد شُعب مسندة إليك بعد"
            subtitle="تواصل مع المدير التقني ليتم إسناد شعبة لك"
          />
        </div>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab classes={classes} studentsByClass={studentsByClass} />}
          {tab === 'sessions' && <SessionsTab classes={classes} studentsByClass={studentsByClass} teacherId={profile?.id ?? ''} />}
          {tab === 'students' && <StudentsTab allStudents={allStudents} />}
          {tab === 'tasks' && <TasksTab classes={classes} studentsByClass={studentsByClass} allStudents={allStudents} />}
          {tab === 'notes' && <NotesTab allStudents={allStudents} />}
        </>
      )}
    </DashboardLayout>
  );
}

/* ============================== OVERVIEW ============================== */

function OverviewTab({ classes, studentsByClass }: { classes: ClassEntry[]; studentsByClass: Record<string, Profile[]> }) {
  const totalStudents = useMemo(
    () => new Set(Object.values(studentsByClass).flat().map((s) => s.id)).size,
    [studentsByClass]
  );

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-3xl font-bold text-forest-800">{classes.length}</p>
          <p className="text-sm text-charcoal-500 mt-1">شُعب مسندة</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-forest-800">{totalStudents}</p>
          <p className="text-sm text-charcoal-500 mt-1">طالب</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-forest-800">
            {classes.filter((c) => c.role === 'primary').length}
          </p>
          <p className="text-sm text-charcoal-500 mt-1">كمعلّم أساسي</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-forest-800">
            {classes.filter((c) => c.classInfo.is_hifz).length}
          </p>
          <p className="text-sm text-charcoal-500 mt-1">شُعب حفظ</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {classes.map(({ classInfo, role }) => (
          <div key={classInfo.id} className="card">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-bold text-forest-900 text-lg">{classInfo.name}</h3>
                {classInfo.description && <p className="text-sm text-charcoal-500 mt-0.5">{classInfo.description}</p>}
              </div>
              <div className="flex gap-2">
                <Badge color={role === 'primary' ? 'gold' : 'gray'}>{CLASS_ASSIGNMENT_ROLE_LABELS[role]}</Badge>
                {classInfo.is_hifz && <Badge color="forest">حفظ</Badge>}
              </div>
            </div>
            <div className="space-y-2 text-sm text-charcoal-600">
              <p className="flex items-center gap-2">
                <Users className="w-4 h-4 text-forest-600" />
                {(studentsByClass[classInfo.id] || []).length} طالب
                {classInfo.capacity ? ` / سعة ${classInfo.capacity}` : ''}
              </p>
              <p className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-forest-600" />
                {formatScheduleDays(classInfo.schedule_days)}
                {classInfo.schedule_start_time && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4 text-forest-600" />
                    {classInfo.schedule_start_time.slice(0, 5)}
                    {classInfo.schedule_end_time ? ` – ${classInfo.schedule_end_time.slice(0, 5)}` : ''}
                  </span>
                )}
              </p>
              {(classInfo.location || classInfo.is_online) && (
                <p className="text-charcoal-500">
                  {classInfo.is_online ? 'حصص عن بُعد' : classInfo.location}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================== SESSIONS ============================== */

function SessionsTab({
  classes,
  studentsByClass,
  teacherId,
}: {
  classes: ClassEntry[];
  studentsByClass: Record<string, Profile[]>;
  teacherId: string;
}) {
  const week = useMemo(() => getAcademyWeekYear(), []);
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.classInfo.id ?? '');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const [qrSession, setQrSession] = useState<Session | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [rosterSession, setRosterSession] = useState<Session | null>(null);
  const [scoresSession, setScoresSession] = useState<Session | null>(null);
  const [substituteSession, setSubstituteSession] = useState<Session | null>(null);

  const selectedClass = classes.find((c) => c.classInfo.id === selectedClassId)?.classInfo;

  const loadSessions = useCallback(async () => {
    if (!selectedClassId) return;
    setSessions(await listGroupSessions(selectedClassId));
  }, [selectedClassId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Rotate the QR payload every 60 seconds (server-signed token).
  useEffect(() => {
    if (!qrSession) return;
    const render = async () => {
      const payload = await generateQrPayload(qrSession.id);
      const url = await QRCode.toDataURL(payload, {
        width: 300, margin: 2, color: { dark: '#132E20', light: '#FDFBF7' },
      });
      setQrDataUrl(url);
    };
    render();
    const interval = setInterval(render, 60000);
    return () => clearInterval(interval);
  }, [qrSession]);

  const handleGenerate = async () => {
    setBusy(true);
    setMessage('');
    const result = await generateWeekSessions(selectedClassId, week.weekStart);
    setMessage(result.ok
      ? (result.created > 0 ? `تم توليد ${result.created} حصة لهذا الأسبوع` : 'حصص هذا الأسبوع موجودة مسبقاً')
      : `فشل التوليد: ${result.error}`);
    await loadSessions();
    setBusy(false);
  };

  const handleStart = async (session: Session) => {
    await startSessionNow(session.id);
    await loadSessions();
    setQrSession({ ...session, is_active: true });
  };

  const handleClose = async (session: Session) => {
    await closeSession(session.id);
    if (qrSession?.id === session.id) setQrSession(null);
    await loadSessions();
  };

  return (
    <div>
      <div className="card mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="label">الشعبة</label>
            <select className="input" value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
              {classes.map(({ classInfo }) => (
                <option key={classInfo.id} value={classInfo.id}>{classInfo.name}</option>
              ))}
            </select>
          </div>
          <div className="text-sm text-charcoal-500">
            الأسبوع الحالي: {formatDateArabic(week.weekStart)} — {formatDateArabic(week.weekEnd)}
          </div>
          <button onClick={handleGenerate} disabled={busy || !selectedClass?.schedule_days?.length} className="btn btn-gold text-sm">
            <RefreshCw className="w-4 h-4" /> توليد حصص الأسبوع
          </button>
        </div>
        {!selectedClass?.schedule_days?.length && (
          <p className="text-xs text-gold-700 mt-2">لم تُضبط أيام الجدول لهذه الشعبة بعد — اطلب من المدير ضبطها من إعدادات الشعبة.</p>
        )}
        {message && <p className="text-sm text-forest-700 mt-2">{message}</p>}
      </div>

      {sessions.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Calendar className="w-8 h-8" />} title="لا توجد حصص مجدولة" subtitle="ولّد حصص الأسبوع من جدول الشعبة" />
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session.id} className="card flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-forest-900">{session.title}</h3>
                  {session.is_active && <Badge color="green">نشطة الآن</Badge>}
                  {session.substitute_teacher_id && <Badge color="gold">بمعلّم بديل</Badge>}
                </div>
                <p className="text-sm text-charcoal-500 mt-1">
                  {session.scheduled_date ? formatDateArabic(session.scheduled_date) : 'بدون تاريخ'}
                  {session.start_time ? ` — بدأت ${formatDateArabic(session.start_time)}` : ''}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {!session.is_active ? (
                  <button onClick={() => handleStart(session)} className="btn btn-primary text-sm">
                    <Play className="w-4 h-4" /> بدء
                  </button>
                ) : (
                  <>
                    <button onClick={() => setQrSession(session)} className="btn btn-gold text-sm">
                      <QrCode className="w-4 h-4" /> QR
                    </button>
                    <button onClick={() => handleClose(session)} className="btn btn-danger text-sm">
                      <Square className="w-4 h-4" /> إنهاء
                    </button>
                  </>
                )}
                <button onClick={() => setRosterSession(session)} className="btn btn-outline text-sm">الحضور</button>
                <button onClick={() => setScoresSession(session)} className="btn btn-outline text-sm">
                  <Star className="w-4 h-4" /> التقييم السريع
                </button>
                <button onClick={() => setSubstituteSession(session)} className="btn btn-outline text-sm">
                  <UserPlus className="w-4 h-4" /> بديل
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Live QR */}
      <Modal open={!!qrSession} onClose={() => setQrSession(null)} title={`رمز الحضور — ${qrSession?.title ?? ''}`}>
        <div className="text-center">
          {qrDataUrl && <img src={qrDataUrl} alt="QR" className="mx-auto rounded-xl border border-cream-200" />}
          <p className="text-sm text-charcoal-500 mt-3">يتجدد الرمز تلقائياً كل 60 ثانية — التحقق يتم على الخادم</p>
        </div>
      </Modal>

      {rosterSession && (
        <RosterModal
          session={rosterSession}
          students={studentsByClass[rosterSession.group_id ?? ''] || []}
          onClose={() => setRosterSession(null)}
        />
      )}

      {scoresSession && (
        <ScoresModal
          session={scoresSession}
          students={studentsByClass[scoresSession.group_id ?? ''] || []}
          onClose={() => setScoresSession(null)}
        />
      )}

      {substituteSession && (
        <SubstituteModal
          session={substituteSession}
          classId={substituteSession.group_id ?? ''}
          teacherId={teacherId}
          onClose={() => { setSubstituteSession(null); loadSessions(); }}
        />
      )}
    </div>
  );
}

/* ============================== ROSTER MODAL ============================== */

const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = { present: 'حاضر', late: 'متأخر', absent: 'غائب' };

function RosterModal({ session, students, onClose }: { session: Session; students: Profile[]; onClose: () => void }) {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [saving, setSaving] = useState(false);

  const loadAttendance = useCallback(async () => {
    const { data } = await supabase.from('attendance').select('*').eq('session_id', session.id);
    setAttendance((data as Attendance[]) || []);
  }, [session.id]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  const setStatus = async (studentId: string, status: AttendanceStatus) => {
    setSaving(true);
    await supabase.from('attendance').upsert(
      {
        student_id: studentId,
        session_id: session.id,
        status,
        points_deducted: status === 'absent' ? 5 : 0,
      },
      { onConflict: 'student_id,session_id' }
    );
    await loadAttendance();
    setSaving(false);
  };

  const statusOf = (studentId: string): AttendanceStatus | null =>
    attendance.find((a) => a.student_id === studentId)?.status ?? null;

  return (
    <Modal open onClose={onClose} title={`سجل الحضور — ${session.title}`} size="lg">
      {students.length === 0 ? (
        <EmptyState icon={<Users className="w-8 h-8" />} title="لا يوجد طلاب في هذه الشعبة" />
      ) : (
        <div className="space-y-2">
          {students.map((student) => {
            const current = statusOf(student.id);
            return (
              <div key={student.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-cream-200">
                <span className="font-medium text-charcoal-800">{student.full_name}</span>
                <div className="flex gap-1.5">
                  {(['present', 'late', 'absent'] as AttendanceStatus[]).map((status) => (
                    <button
                      key={status}
                      disabled={saving}
                      onClick={() => setStatus(student.id, status)}
                      className={`btn text-xs px-3 py-1.5 ${
                        current === status
                          ? status === 'present' ? 'btn-primary' : status === 'late' ? 'btn-gold' : 'btn-danger'
                          : 'btn-outline'
                      }`}
                    >
                      {ATTENDANCE_LABELS[status]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/* ============================== SCORES MODAL ============================== */

type ScoreDraft = {
  attendance_score: number | null;
  recitation_score: number | null;
  behavior_score: number | null;
  note: string;
};

function ScoresModal({ session, students, onClose }: { session: Session; students: Profile[]; onClose: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, ScoreDraft>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const EMPTY_DRAFT: ScoreDraft = { attendance_score: null, recitation_score: null, behavior_score: null, note: '' };

  useEffect(() => {
    listSessionScores(session.id).then((existing: SessionScore[]) => {
      const map: Record<string, ScoreDraft> = {};
      for (const score of existing) {
        map[score.student_id] = {
          attendance_score: score.attendance_score,
          recitation_score: score.recitation_score,
          behavior_score: score.behavior_score,
          note: score.note,
        };
      }
      setDrafts(map);
    });
  }, [session.id]);

  const updateDraft = (studentId: string, patch: Partial<ScoreDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] ?? EMPTY_DRAFT), ...patch },
    }));
  };

  const saveAll = async () => {
    setSaving(true);
    setSavedMsg('');
    for (const [studentId, draft] of Object.entries(drafts)) {
      await upsertSessionScore({ session_id: session.id, student_id: studentId, ...draft });
    }
    setSavedMsg('تم حفظ التقييمات — ستدخل في التجميع الأسبوعي تلقائياً');
    setSaving(false);
  };

  const scoreSelect = (studentId: string, field: 'attendance_score' | 'recitation_score' | 'behavior_score', label: string) => (
    <div>
      <label className="label text-xs">{label}</label>
      <select
        className="input py-1.5 text-sm"
        value={drafts[studentId]?.[field] ?? ''}
        onChange={(e) => updateDraft(studentId, { [field]: e.target.value === '' ? null : Number(e.target.value) })}
      >
        <option value="">—</option>
        {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );

  return (
    <Modal open onClose={onClose} title={`التقييم السريع — ${session.title}`} size="xl">
      {students.length === 0 ? (
        <EmptyState icon={<Users className="w-8 h-8" />} title="لا يوجد طلاب في هذه الشعبة" />
      ) : (
        <>
          <div className="space-y-4">
            {students.map((student) => (
              <div key={student.id} className="p-4 rounded-xl border border-cream-200">
                <p className="font-bold text-forest-900 mb-3">{student.full_name}</p>
                <div className="grid grid-cols-3 gap-3">
                  {scoreSelect(student.id, 'attendance_score', 'الحضور والانضباط')}
                  {scoreSelect(student.id, 'recitation_score', 'إتقان التسميع')}
                  {scoreSelect(student.id, 'behavior_score', 'السلوك')}
                </div>
                <input
                  className="input mt-3 text-sm"
                  placeholder="ملاحظة قصيرة (اختياري)"
                  value={drafts[student.id]?.note ?? ''}
                  onChange={(e) => updateDraft(student.id, { note: e.target.value })}
                />
              </div>
            ))}
          </div>
          {savedMsg && <p className="text-sm text-forest-700 mt-3">{savedMsg}</p>}
          <button onClick={saveAll} disabled={saving} className="btn btn-primary w-full mt-4">
            حفظ كل التقييمات
          </button>
        </>
      )}
    </Modal>
  );
}

/* ============================== SUBSTITUTE MODAL ============================== */

function SubstituteModal({
  session,
  classId,
  teacherId,
  onClose,
}: {
  session: Session;
  classId: string;
  teacherId: string;
  onClose: () => void;
}) {
  const [teachers, setTeachers] = useState<ClassTeacherDetail[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getClassTeachersDetailed(classId).then(setTeachers);
  }, [classId]);

  const assign = async (targetTeacherId: string | null) => {
    setSaving(true);
    await setSessionSubstitute(session.id, targetTeacherId);
    setSaving(false);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`تعيين معلّم بديل — ${session.title}`}>
      <p className="text-sm text-charcoal-500 mb-4">
        البديل يخص هذه الحصة فقط ولا يغيّر المعلّم الأساسي للشعبة.
      </p>
      {teachers.filter((t) => t.teacher_id !== teacherId).length === 0 ? (
        <EmptyState icon={<UserPlus className="w-8 h-8" />} title="لا يوجد معلّمون آخرون مسندون لهذه الشعبة" />
      ) : (
        <div className="space-y-2">
          {teachers.filter((t) => t.teacher_id !== teacherId).map((teacher) => (
            <button
              key={teacher.teacher_id}
              disabled={saving}
              onClick={() => assign(teacher.teacher_id)}
              className={`w-full flex items-center justify-between p-3 rounded-xl border text-right transition-colors ${
                session.substitute_teacher_id === teacher.teacher_id
                  ? 'border-gold-400 bg-gold-100'
                  : 'border-cream-200 hover:bg-cream-50'
              }`}
            >
              <span className="font-medium text-charcoal-800">{teacher.full_name}</span>
              <Badge color="gray">{CLASS_ASSIGNMENT_ROLE_LABELS[teacher.assignment_role]}</Badge>
            </button>
          ))}
        </div>
      )}
      {session.substitute_teacher_id && (
        <button onClick={() => assign(null)} disabled={saving} className="btn btn-outline w-full mt-4 text-sm">
          إزالة البديل والعودة للمعلّم الأساسي
        </button>
      )}
    </Modal>
  );
}

/* ============================== STUDENTS TAB ============================== */

type StudentRow = { profile: Profile; classNames: string[] };

function StudentsTab({ allStudents }: { allStudents: StudentRow[] }) {
  const [query, setQuery] = useState('');
  const [noteStudent, setNoteStudent] = useState<Profile | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return allStudents;
    return allStudents.filter((s) =>
      s.profile.full_name.includes(q) || s.classNames.some((c) => c.includes(q))
    );
  }, [allStudents, query]);

  return (
    <div>
      <div className="card mb-4">
        <div className="relative">
          <Search className="w-4 h-4 text-charcoal-400 absolute top-1/2 -translate-y-1/2 right-4" />
          <input
            className="input pr-10"
            placeholder="ابحث بالاسم أو الشعبة…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card"><EmptyState icon={<GraduationCap className="w-8 h-8" />} title="لا يوجد طلاب مطابقون" /></div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream-100 text-charcoal-600">
                <th className="text-right px-4 py-3 font-medium">الطالب</th>
                <th className="text-right px-4 py-3 font-medium">الشُعب</th>
                <th className="text-right px-4 py-3 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ profile: student, classNames }) => (
                <tr key={student.id} className="border-t border-cream-200 hover:bg-cream-50">
                  <td className="px-4 py-3 font-medium text-forest-900">{student.full_name}</td>
                  <td className="px-4 py-3 text-charcoal-500">{classNames.join('، ')}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setNoteStudent(student)} className="btn btn-outline text-xs px-3 py-1.5">
                      <StickyNote className="w-3.5 h-3.5" /> ملاحظة
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {noteStudent && <QuickNoteModal student={noteStudent} onClose={() => setNoteStudent(null)} />}
    </div>
  );
}

/* ============================== NOTES TAB ============================== */

function NotesTab({ allStudents }: { allStudents: StudentRow[] }) {
  const [selectedId, setSelectedId] = useState('');
  const selected = allStudents.find((s) => s.profile.id === selectedId)?.profile ?? null;

  return (
    <div>
      <div className="card mb-4">
        <label className="label">اختر الطالب</label>
        <select className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">—</option>
          {allStudents.map(({ profile: student, classNames }) => (
            <option key={student.id} value={student.id}>
              {student.full_name} — {classNames.join('، ')}
            </option>
          ))}
        </select>
      </div>

      {selected && <QuickNoteModal student={selected} inline onClose={() => setSelectedId('')} />}
    </div>
  );
}

/** Note composer + recent notes. Used as a modal (students tab) or inline card (notes tab). */
function QuickNoteModal({ student, inline, onClose }: { student: Profile; inline?: boolean; onClose: () => void }) {
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [text, setText] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('supervisor');
  const [visibility, setVisibility] = useState<NoteVisibility>('student');
  const [pointsImpact, setPointsImpact] = useState(0);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const loadNotes = useCallback(async () => {
    setNotes(await listStudentNotes(student.id));
  }, [student.id]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    setFeedback('');
    const { error } = await createStudentNote({
      student_id: student.id,
      note: text,
      note_type: noteType,
      points_impact: pointsImpact,
      visibility,
    });
    if (error) {
      setFeedback(`فشل الحفظ: ${error}`);
    } else {
      if (visibility !== 'private_staff') {
        await createNotification(student.id, 'ملاحظة جديدة', text.trim().slice(0, 120), 'note');
      }
      setFeedback('تم حفظ الملاحظة');
      setText('');
      setPointsImpact(0);
      await loadNotes();
    }
    setSaving(false);
  };

  const content = (
    <div>
      <div className="grid md:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="label">النوع</label>
          <select className="input" value={noteType} onChange={(e) => setNoteType(e.target.value as NoteType)}>
            {(Object.keys(NOTE_TYPE_LABELS) as NoteType[]).map((t) => (
              <option key={t} value={t}>{NOTE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">الخصوصية</label>
          <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value as NoteVisibility)}>
            {(Object.keys(NOTE_VISIBILITY_LABELS) as NoteVisibility[]).map((v) => (
              <option key={v} value={v}>{NOTE_VISIBILITY_LABELS[v]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">تأثير النقاط</label>
          <input
            type="number"
            className="input"
            value={pointsImpact}
            onChange={(e) => setPointsImpact(Number(e.target.value) || 0)}
          />
        </div>
      </div>
      <textarea
        className="input min-h-[90px]"
        placeholder="اكتب الملاحظة…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {visibility === 'private_staff' && (
        <p className="text-xs text-gold-700 mt-2">ملاحظة خاصة بالمشرفين — لن يراها الطالب ولن تصله إشعارات.</p>
      )}
      {feedback && <p className="text-sm text-forest-700 mt-2">{feedback}</p>}
      <button onClick={submit} disabled={saving || !text.trim()} className="btn btn-primary w-full mt-3">
        حفظ الملاحظة
      </button>

      <div className="mt-6">
        <h4 className="font-bold text-forest-900 mb-2 text-sm">آخر الملاحظات</h4>
        {notes.length === 0 ? (
          <p className="text-sm text-charcoal-400">لا توجد ملاحظات مسجلة</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {notes.slice(0, 15).map((note) => (
              <div key={note.id} className="p-3 rounded-xl bg-cream-50 border border-cream-200">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge color="gray">{NOTE_TYPE_LABELS[note.note_type]}</Badge>
                  <Badge color={note.visibility === 'private_staff' ? 'gold' : 'forest'}>
                    {NOTE_VISIBILITY_LABELS[note.visibility]}
                  </Badge>
                  {note.points_impact !== 0 && (
                    <Badge color={note.points_impact > 0 ? 'green' : 'red'}>
                      {note.points_impact > 0 ? `+${note.points_impact}` : note.points_impact}
                    </Badge>
                  )}
                  <span className="text-xs text-charcoal-400">{formatDateArabic(note.created_at)}</span>
                </div>
                <p className="text-sm text-charcoal-700">{note.note}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (inline) {
    return <div className="card">{content}</div>;
  }
  return (
    <Modal open onClose={onClose} title={`ملاحظة — ${student.full_name}`} size="lg">
      {content}
    </Modal>
  );
}

/* ============================== TASKS TAB ============================== */

function TasksTab({
  classes,
  studentsByClass,
  allStudents,
}: {
  classes: ClassEntry[];
  studentsByClass: Record<string, Profile[]>;
  allStudents: StudentRow[];
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [targetClassId, setTargetClassId] = useState(classes[0]?.classInfo.id ?? '');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);

  const studentNameById = useMemo(() => {
    const map = new Map<string, string>();
    allStudents.forEach((s) => map.set(s.profile.id, s.profile.full_name));
    return map;
  }, [allStudents]);

  const loadTasks = useCallback(async () => {
    const ids = [...studentNameById.keys()];
    if (ids.length === 0) { setTasks([]); return; }
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .in('student_id', ids)
      .order('created_at', { ascending: false })
      .limit(100);
    setTasks((data as Task[]) || []);
  }, [studentNameById]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const assign = async () => {
    const targets = studentsByClass[targetClassId] || [];
    if (!title.trim() || targets.length === 0) return;
    setSaving(true);
    setFeedback('');
    const result = await insertTasksForStudents(
      targets.map((s) => ({
        student_id: s.id,
        category_id: null,
        title: title.trim(),
        description: description.trim(),
        due_date: dueDate || null,
      }))
    );
    if (result.ok) {
      for (const s of targets) {
        await createNotification(s.id, 'مهمة جديدة', title.trim(), 'general');
      }
      setFeedback(`تم إسناد المهمة إلى ${targets.length} طالب`);
      setTitle('');
      setDescription('');
      setDueDate('');
      await loadTasks();
    } else {
      setFeedback(`فشل الإسناد: ${result.error}`);
    }
    setSaving(false);
  };

  return (
    <div>
      <div className="card mb-4">
        <h3 className="font-bold text-forest-900 mb-3">إسناد مهمة لشعبة</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="label">عنوان المهمة</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">تاريخ التسليم (اختياري)</label>
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="label">الوصف</label>
            <textarea className="input min-h-[70px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="label">الشعبة المستهدفة</label>
            <select className="input" value={targetClassId} onChange={(e) => setTargetClassId(e.target.value)}>
              {classes.map(({ classInfo }) => (
                <option key={classInfo.id} value={classInfo.id}>
                  {classInfo.name} ({(studentsByClass[classInfo.id] || []).length} طالب)
                </option>
              ))}
            </select>
          </div>
        </div>
        {feedback && <p className="text-sm text-forest-700 mt-2">{feedback}</p>}
        <button onClick={assign} disabled={saving || !title.trim()} className="btn btn-gold mt-3">
          إسناد للجميع
        </button>
      </div>

      <div className="card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-cream-100 text-charcoal-600">
              <th className="text-right px-4 py-3 font-medium">المهمة</th>
              <th className="text-right px-4 py-3 font-medium">الطالب</th>
              <th className="text-right px-4 py-3 font-medium">الحالة</th>
              <th className="text-right px-4 py-3 font-medium">التسليم</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-charcoal-400">لا توجد مهام مسندة بعد</td></tr>
            )}
            {tasks.map((task) => {
              const status = normalizeTaskStatus(task);
              return (
                <tr key={task.id} className="border-t border-cream-200">
                  <td className="px-4 py-3 font-medium text-forest-900">{task.title}</td>
                  <td className="px-4 py-3 text-charcoal-600">{studentNameById.get(task.student_id) ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge color={TASK_STATUS_COLORS[status] as 'gray' | 'gold' | 'forest' | 'green'}>
                      {TASK_STATUS_LABELS[status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-charcoal-500">{task.due_date ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

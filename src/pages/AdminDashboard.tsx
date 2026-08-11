import { useEffect, useState, useCallback, useRef } from 'react';
import { Users, ClipboardCheck, GraduationCap, Star, DollarSign, QrCode, Settings, CircleCheck as CheckCircle, Circle as XCircle, Clock, Plus, Trash2, CreditCard as Edit, Save, X, Calendar, MapPin, Award, BookOpen, Trophy, Play, Pause, TriangleAlert as AlertTriangle, StickyNote } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Modal } from '@/components/Modal';
import { Loading, EmptyState, Badge } from '@/components/ui';
import { StarRating } from '@/components/StarRating';
import { computeStarFills, getCurrentWeekYear, getCategoryStars, computeCoursePoints } from '@/lib/scoring';
import { generateQrPayload, sessionSecret } from '@/lib/qr';
import { createNotification } from '@/lib/notifications';
import { formatDateArabic, formatTimeArabic } from '@/lib/date';
import type { Profile, Course, Category, Evaluation, Session, FinancialDue, Task, Attendance, StudentNote, NoteType } from '@/lib/types';
import QRCode from 'qrcode';

type Tab = 'overview' | 'approvals' | 'students' | 'attendance' | 'evaluations' | 'financial' | 'categories' | 'settings';

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('overview');
  const { profile } = useAuth();

  const navItems = [
    { path: '/admin', label: 'الرئيسية', icon: <Users className="w-5 h-5" /> },
  ];

  return (
    <DashboardLayout navItems={navItems}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-forest-900">لوحة تحكم الشيخ</h1>
        <p className="text-charcoal-500 text-sm mt-1">إدارة الطلاب والحضور والتقييمات والمالية</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-4 px-4 lg:mx-0 lg:px-0">
        {([
          ['overview', 'نظرة عامة', <Users className="w-4 h-4" />],
          ['approvals', 'الموافقات', <ClipboardCheck className="w-4 h-4" />],
          ['students', 'الطلاب', <GraduationCap className="w-4 h-4" />],
          ['attendance', 'الحضور', <QrCode className="w-4 h-4" />],
          ['evaluations', 'التقييمات', <Star className="w-4 h-4" />],
          ['categories', 'الفئات', <Award className="w-4 h-4" />],
          ['financial', 'المالية', <DollarSign className="w-4 h-4" />],
          ['settings', 'الإعدادات', <Settings className="w-4 h-4" />],
        ] as [Tab, string, React.ReactNode][]).map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap transition-all ${tab === key ? 'bg-forest-800 text-cream-50 font-bold' : 'bg-white text-charcoal-600 hover:bg-cream-100'}`}
          >
            {icon}
            <span className="text-sm">{label}</span>
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'approvals' && <ApprovalsTab />}
      {tab === 'students' && <StudentsTab />}
      {tab === 'attendance' && <AttendanceTab />}
      {tab === 'evaluations' && <EvaluationsTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'financial' && <FinancialTab />}
      {tab === 'settings' && <SettingsTab />}
    </DashboardLayout>
  );
}

// ============ OVERVIEW ============
function OverviewTab() {
  const [stats, setStats] = useState({ pending: 0, approved: 0, courses: 0, unpaidTotal: 0 });
  const [leaderboard, setLeaderboard] = useState<{ id: string; full_name: string; totalDeducted: number; presentCount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ count: pending }, { count: approved }, { count: courses }, { data: dues }, { data: students }, { data: evals }, { data: att }] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student').eq('status', 'pending'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student').eq('status', 'approved'),
        supabase.from('courses').select('*', { count: 'exact', head: true }),
        supabase.from('financial_dues').select('amount').eq('status', 'unpaid'),
        supabase.from('profiles').select('id, full_name').eq('role', 'student').eq('status', 'approved').order('full_name'),
        supabase.from('evaluations').select('student_id, points_deducted'),
        supabase.from('attendance').select('student_id, status').eq('status', 'present'),
      ]);
      const unpaidTotal = dues?.reduce((s, d) => s + Number(d.amount), 0) || 0;
      setStats({ pending: pending || 0, approved: approved || 0, courses: courses || 0, unpaidTotal });

      // Build leaderboard: lower totalDeducted = higher rank; presentCount as tiebreaker
      const studentList = students as Pick<Profile, 'id' | 'full_name'>[] || [];
      const deductedMap: Record<string, number> = {};
      (evals || []).forEach((e: any) => {
        deductedMap[e.student_id] = (deductedMap[e.student_id] || 0) + (e.points_deducted || 0);
      });
      const presentMap: Record<string, number> = {};
      (att || []).forEach((a: any) => {
        presentMap[a.student_id] = (presentMap[a.student_id] || 0) + 1;
      });
      const ranked = studentList.map((s) => ({
        id: s.id,
        full_name: s.full_name,
        totalDeducted: deductedMap[s.id] || 0,
        presentCount: presentMap[s.id] || 0,
      })).sort((a, b) => a.totalDeducted - b.totalDeducted || b.presentCount - a.presentCount).slice(0, 10);
      setLeaderboard(ranked);
      setLoading(false);
    })();
  }, []);

  if (loading) return <Loading />;

  const cards = [
    { label: 'طلاب قيد المراجعة', value: stats.pending, icon: <Clock className="w-6 h-6" />, color: 'bg-gold-100 text-gold-700' },
    { label: 'طلاب معتمدون', value: stats.approved, icon: <GraduationCap className="w-6 h-6" />, color: 'bg-forest-100 text-forest-800' },
    { label: 'الدورات', value: stats.courses, icon: <BookOpen className="w-6 h-6" />, color: 'bg-blue-100 text-blue-700' },
    { label: 'إجمالي المستحقات', value: `${stats.unpaidTotal}`, icon: <DollarSign className="w-6 h-6" />, color: 'bg-red-100 text-red-700' },
  ];

  const rankColors = ['bg-gold-400 text-forest-900', 'bg-cream-300 text-forest-900', 'bg-orange-200 text-forest-900', 'bg-cream-100 text-charcoal-600', 'bg-cream-100 text-charcoal-600'];
  const rankLabels = ['المركز الأول', 'المركز الثاني', 'المركز الثالث', 'المركز الرابع', 'المركز الخامس'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${c.color}`}>{c.icon}</div>
            <p className="text-2xl font-bold text-forest-900">{c.value}</p>
            <p className="text-charcoal-500 text-sm">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-6 h-6 text-gold-500" />
          <h3 className="text-lg font-bold text-forest-900">الأعلى تقيماً</h3>
          <span className="text-xs text-charcoal-400">ترتيب الطلاب حسب أدنى خصم وأكثر حضور</span>
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-charcoal-400 py-4 text-center">لا يوجد طلاب معتمدون بعد</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((s, i) => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl bg-cream-50 hover:bg-cream-100 transition-colors">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${rankColors[i] || rankColors[4]}`}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-forest-900">{s.full_name}</p>
                  <p className="text-xs text-charcoal-400">{rankLabels[i] || `المركز ${i + 1}`}</p>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-forest-800">خصم: {s.totalDeducted}</p>
                  <p className="text-xs text-green-600">حضور: {s.presentCount}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ APPROVALS ============
function ApprovalsTab() {
  const [pending, setPending] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').eq('status', 'pending').eq('role', 'student').order('created_at', { ascending: false });
    setPending(data as Profile[] || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (p: Profile) => {
    await supabase.from('profiles').update({ status: 'approved' }).eq('id', p.id);
    await createNotification(p.id, 'تمت الموافقة على حسابك', 'مرحباً بك في أكاديمية زاد الإحسان! يمكنك الآن الدخول إلى بوابتك.', 'general');
    load();
  };

  const reject = async (p: Profile) => {
    await supabase.from('profiles').update({ status: 'rejected' }).eq('id', p.id);
    load();
  };

  if (loading) return <Loading />;
  if (pending.length === 0) return <EmptyState icon={<ClipboardCheck className="w-8 h-8" />} title="لا توجد طلبات انتظار" subtitle="جميع الطلبات تمت مراجعتها" />;

  return (
    <div className="space-y-3">
      {pending.map((p) => (
        <div key={p.id} className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gold-100 text-gold-700 flex items-center justify-center font-bold text-lg">
              {p.full_name.charAt(0)}
            </div>
            <div>
              <p className="font-bold text-forest-900">{p.full_name}</p>
              <p className="text-sm text-charcoal-500">
                {p.age ? `العمر: ${p.age} • ` : ''}{p.parent_phone ? `هاتف ولي الأمر: ${p.parent_phone}` : ''}
              </p>
              <p className="text-xs text-charcoal-400 mt-0.5">سُجّل في {formatDateArabic(p.created_at)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => approve(p)} className="btn btn-primary text-sm">
              <CheckCircle className="w-4 h-4" />
              موافقة
            </button>
            <button onClick={() => reject(p)} className="btn btn-danger text-sm">
              <XCircle className="w-4 h-4" />
              رفض
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============ USERS (all profiles) ============
// ============ STUDENT NOTES ============
function StudentNotesSection({ studentId, courses }: { studentId: string; courses: Course[] }) {
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [newCourseId, setNewCourseId] = useState<string>('');
  const [newPointsImpact, setNewPointsImpact] = useState<string>('0');
  const [newExcused, setNewExcused] = useState(false);
  const [newNoteType, setNewNoteType] = useState<NoteType>('supervisor');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [editCourseId, setEditCourseId] = useState<string>('');
  const [editPointsImpact, setEditPointsImpact] = useState<string>('0');
  const [editExcused, setEditExcused] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('student_notes')
      .select('*, course:courses(*)').eq('student_id', studentId).order('created_at', { ascending: false });
    setNotes(data as StudentNote[] || []);
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    setSaving(true);
    const impact = newExcused ? 0 : (parseInt(newPointsImpact) || 0);
    await supabase.from('student_notes').insert({
      student_id: studentId,
      note: newNote.trim(),
      note_type: newNoteType,
      course_id: newCourseId || null,
      points_impact: impact,
      excused: newExcused,
    });
    setNewNote('');
    setNewCourseId('');
    setNewPointsImpact('0');
    setNewExcused(false);
    setNewNoteType('supervisor');
    setSaving(false);
    load();
  };

  const deleteNote = async (id: string) => {
    await supabase.from('student_notes').delete().eq('id', id);
    load();
  };

  const startEdit = (n: StudentNote) => {
    setEditingId(n.id);
    setEditNote(n.note);
    setEditCourseId(n.course_id || '');
    setEditPointsImpact(String(n.points_impact || 0));
    setEditExcused(n.excused || false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditNote('');
    setEditCourseId('');
    setEditPointsImpact('0');
    setEditExcused(false);
  };

  const saveEdit = async (id: string) => {
    if (!editNote.trim()) return;
    setEditSaving(true);
    const impact = editExcused ? 0 : (parseInt(editPointsImpact) || 0);
    await supabase.from('student_notes').update({
      note: editNote.trim(),
      course_id: editCourseId || null,
      points_impact: impact,
      excused: editExcused,
    }).eq('id', id);
    setEditSaving(false);
    cancelEdit();
    load();
  };

  const typeLabels: Record<string, { label: string; color: string }> = {
    supervisor: { label: 'ملاحظة مشرف', color: 'bg-blue-100 text-blue-700' },
    absence: { label: 'غياب تلقائي', color: 'bg-red-100 text-red-700' },
    general: { label: 'عامة', color: 'bg-cream-100 text-charcoal-600' },
    excuse: { label: 'غياب بعذر', color: 'bg-gold-100 text-gold-700' },
    custom: { label: 'مخصصة', color: 'bg-forest-100 text-forest-700' },
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <StickyNote className="w-5 h-5 text-forest-700" />
        <h4 className="font-bold text-forest-900">الملاحظات والغياب</h4>
      </div>

      {/* Add Note Form */}
      <div className="space-y-3 mb-4 p-4 rounded-xl bg-cream-50 border border-cream-200">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">نوع الملاحظة</label>
            <select value={newNoteType} onChange={(e) => setNewNoteType(e.target.value as NoteType)} className="input">
              <option value="supervisor">ملاحظة مشرف</option>
              <option value="absence">غياب</option>
              <option value="excuse">غياب بعذر</option>
              <option value="custom">مخصصة</option>
              <option value="general">عامة</option>
            </select>
          </div>
          <div>
            <label className="label">الدورة (اختياري)</label>
            <select value={newCourseId} onChange={(e) => setNewCourseId(e.target.value)} className="input">
              <option value="">— بدون —</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">الملاحظة</label>
          <input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            className="input"
            placeholder="أضف ملاحظة كمشرف..."
            onKeyDown={(e) => e.key === 'Enter' && addNote()}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[120px]">
            <label className="label">تأثير النقاط (− أو +)</label>
            <input
              type="number"
              value={newPointsImpact}
              onChange={(e) => setNewPointsImpact(e.target.value)}
              disabled={newExcused}
              className="input disabled:opacity-50"
              placeholder="مثال: -5 أو +5"
            />
          </div>
          <label className={`flex items-center gap-2 cursor-pointer p-2.5 rounded-xl border transition-all ${newExcused ? 'bg-gold-100 border-gold-300' : 'bg-white border-cream-200'}`}>
            <input
              type="checkbox"
              checked={newExcused}
              onChange={(e) => {
                setNewExcused(e.target.checked);
                if (e.target.checked) setNewPointsImpact('0');
              }}
              className="w-5 h-5 accent-gold-500"
            />
            <span className="text-sm font-medium text-charcoal-700">غياب بعذر</span>
          </label>
          <button onClick={addNote} disabled={saving || !newNote.trim()} className="btn btn-primary text-sm disabled:opacity-50">
            <Plus className="w-4 h-4" />
            إضافة
          </button>
        </div>
      </div>

      {/* Notes List */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {notes.length === 0 ? (
          <p className="text-sm text-charcoal-400">لا توجد ملاحظات</p>
        ) : notes.map((n) => (
          <div key={n.id} className="p-3 rounded-xl bg-cream-50">
            {editingId === n.id ? (
              /* Edit Mode */
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">الدورة</label>
                    <select value={editCourseId} onChange={(e) => setEditCourseId(e.target.value)} className="input">
                      <option value="">— بدون —</option>
                      {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">تأثير النقاط</label>
                    <input
                      type="number"
                      value={editPointsImpact}
                      onChange={(e) => setEditPointsImpact(e.target.value)}
                      disabled={editExcused}
                      className="input disabled:opacity-50"
                    />
                  </div>
                </div>
                <div>
                  <label className="label">الملاحظة</label>
                  <input value={editNote} onChange={(e) => setEditNote(e.target.value)} className="input" />
                </div>
                <label className={`flex items-center gap-2 cursor-pointer p-2.5 rounded-xl border transition-all w-fit ${editExcused ? 'bg-gold-100 border-gold-300' : 'bg-white border-cream-200'}`}>
                  <input
                    type="checkbox"
                    checked={editExcused}
                    onChange={(e) => {
                      setEditExcused(e.target.checked);
                      if (e.target.checked) setEditPointsImpact('0');
                    }}
                    className="w-5 h-5 accent-gold-500"
                  />
                  <span className="text-sm font-medium text-charcoal-700">غياب بعذر</span>
                </label>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(n.id)} disabled={editSaving || !editNote.trim()} className="btn btn-primary text-sm disabled:opacity-50">
                    <Save className="w-4 h-4" />
                    حفظ
                  </button>
                  <button onClick={cancelEdit} className="btn btn-outline text-sm">
                    <X className="w-4 h-4" />
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              /* View Mode */
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeLabels[n.note_type]?.color || typeLabels.general.color}`}>
                      {typeLabels[n.note_type]?.label || 'عامة'}
                    </span>
                    {n.course && (
                      <span className="text-xs text-forest-600 font-medium">{n.course.title}</span>
                    )}
                    {n.excused && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gold-100 text-gold-700">معذور</span>
                    )}
                    {n.points_impact !== 0 && !n.excused && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${n.points_impact < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {n.points_impact > 0 ? `+${n.points_impact}` : n.points_impact} نقطة
                      </span>
                    )}
                    <span className="text-xs text-charcoal-400">{formatDateArabic(n.created_at)}</span>
                  </div>
                  <p className="text-sm text-charcoal-700">{n.note}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(n)} className="text-charcoal-400 hover:text-forest-600 p-1">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteNote(n.id)} className="text-charcoal-400 hover:text-red-500 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StudentsTab() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [enrollments, setEnrollments] = useState<Record<string, string[]>>({});
  const [studentScores, setStudentScores] = useState<Record<string, { points: number; pct: number }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: userData }, { data: courseData }, { data: enrollData }, { data: evalData }, { data: noteData }, { data: catData }, { data: settingsData }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('courses').select('*').order('title'),
      supabase.from('student_courses').select('student_id, course_id'),
      supabase.from('evaluations').select('*'),
      supabase.from('student_notes').select('*'),
      supabase.from('categories').select('*'),
      supabase.from('app_settings').select('*').limit(1).maybeSingle(),
    ]);
    setUsers(userData as Profile[] || []);
    setCourses(courseData as Course[] || []);
    const map: Record<string, string[]> = {};
    (enrollData || []).forEach((e: any) => {
      if (!map[e.student_id]) map[e.student_id] = [];
      map[e.student_id].push(e.course_id);
    });
    setEnrollments(map);

    const basePoints = (settingsData as AppSettings | null)?.base_points ?? 100;
    const evals = (evalData || []) as Evaluation[];
    const notes = (noteData || []) as StudentNote[];
    const scores: Record<string, { points: number; pct: number }> = {};
    for (const u of (userData as Profile[] || [])) {
      const cids = map[u.id] || [];
      if (cids.length === 0) continue;
      const avg = cids.reduce((sum, cid) => sum + computeCoursePoints(cid, basePoints, evals.filter(e => e.student_id === u.id), notes.filter(n => n.student_id === u.id)), 0) / cids.length;
      scores[u.id] = { points: Math.round(avg), pct: Math.round((avg / basePoints) * 100) };
    }
    setStudentScores(scores);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleEnrollment = async (studentId: string, courseId: string) => {
    const current = enrollments[studentId] || [];
    if (current.includes(courseId)) {
      await supabase.from('student_courses').delete().eq('student_id', studentId).eq('course_id', courseId);
    } else {
      await supabase.from('student_courses').insert({ student_id: studentId, course_id: courseId });
    };
    load();
  };

  const updateRole = async (userId: string, role: 'admin' | 'student') => {
    await supabase.from('profiles').update({ role }).eq('id', userId);
    load();
    setSelected(prev => prev ? { ...prev, role } : null);
  };

  const updateStatus = async (userId: string, status: 'pending' | 'approved' | 'rejected') => {
    await supabase.from('profiles').update({ status }).eq('id', userId);
    if (status === 'approved') {
      await createNotification(userId, 'تمت الموافقة على حسابك', 'مرحباً بك في أكاديمية زاد الإحسان! يمكنك الآن الدخول إلى بوابتك.', 'general');
    }
    load();
    setSelected(prev => prev ? { ...prev, status } : null);
  };

  if (loading) return <Loading />;
  if (users.length === 0) return <EmptyState icon={<GraduationCap className="w-8 h-8" />} title="لا يوجد مستخدمون" subtitle="بانتظار تسجيل الطلاب" />;

  const roleLabel = (role: string) => role === 'admin' ? 'شيخ / مشرف' : 'طالب';
  const statusLabel = (status: string) => status === 'approved' ? 'معتمد' : status === 'pending' ? 'قيد المراجعة' : 'مرفوض';
  const statusColor = (status: string): 'green' | 'gold' | 'red' => status === 'approved' ? 'green' : status === 'pending' ? 'gold' : 'red';

  return (
    <>
      <div className="mb-4">
        <h3 className="text-lg font-bold text-forest-900">إدارة المستخدمين</h3>
        <p className="text-sm text-charcoal-500">عرض جميع المستخدمين وتعديل أدوارهم وحالاتهم</p>
      </div>
      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${u.role === 'admin' ? 'bg-gold-100 text-gold-700' : 'bg-forest-100 text-forest-800'}`}>
                {u.full_name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-forest-900">{u.full_name}</p>
                  <Badge color={u.role === 'admin' ? 'gold' : 'forest'}>{roleLabel(u.role)}</Badge>
                  <Badge color={statusColor(u.status)}>{statusLabel(u.status)}</Badge>
                  {u.role === 'student' && studentScores[u.id] && (
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${studentScores[u.id].pct >= 80 ? 'bg-green-100 text-green-700' : studentScores[u.id].pct >= 60 ? 'bg-gold-100 text-gold-700' : 'bg-red-100 text-red-700'}`}>
                      <Award className="w-3 h-3" />
                      {studentScores[u.id].pct}%
                    </span>
                  )}
                </div>
                <p className="text-sm text-charcoal-500 mt-0.5">
                  {u.age ? `العمر: ${u.age}` : ''} {u.parent_phone ? `• ${u.parent_phone}` : ''}
                </p>
                <div className="flex gap-1 mt-1">
                  {(enrollments[u.id] || []).map((cid) => {
                    const c = courses.find((c) => c.id === cid);
                    return c ? <Badge key={cid} color="forest">{c.title}</Badge> : null;
                  })}
                </div>
              </div>
            </div>
            <button onClick={() => setSelected(u)} className="btn btn-outline text-sm">
              <Edit className="w-4 h-4" />
              إدارة
            </button>
          </div>
        ))}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.full_name || ''} size="lg">
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-cream-50 rounded-xl p-3">
                <p className="text-charcoal-400">العمر</p>
                <p className="font-bold text-forest-900">{selected.age || '—'}</p>
              </div>
              <div className="bg-cream-50 rounded-xl p-3">
                <p className="text-charcoal-400">هاتف ولي الأمر</p>
                <p className="font-bold text-forest-900">{selected.parent_phone || '—'}</p>
              </div>
              <div className="bg-cream-50 rounded-xl p-3">
                <p className="text-charcoal-400">تقدم القرآن</p>
                <p className="font-bold text-forest-900">{selected.quran_progress}%</p>
              </div>
              <div className="bg-cream-50 rounded-xl p-3">
                <p className="text-charcoal-400">الوحدة الحالية</p>
                <p className="font-bold text-forest-900">{selected.current_module || '—'}</p>
              </div>
            </div>

            {/* Role management */}
            <div>
              <h4 className="font-bold text-forest-900 mb-2">الدور</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => updateRole(selected.id, 'student')}
                  className={`btn text-sm ${selected.role === 'student' ? 'btn-primary' : 'btn-outline'}`}
                >
                  <GraduationCap className="w-4 h-4" />
                  طالب
                </button>
                <button
                  onClick={() => updateRole(selected.id, 'admin')}
                  className={`btn text-sm ${selected.role === 'admin' ? 'btn-gold' : 'btn-outline'}`}
                >
                  <Users className="w-4 h-4" />
                  شيخ / مشرف
                </button>
              </div>
            </div>

            {/* Status management */}
            <div>
              <h4 className="font-bold text-forest-900 mb-2">حالة الحساب</h4>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => updateStatus(selected.id, 'pending')}
                  className={`btn text-sm ${selected.status === 'pending' ? 'bg-gold-400 text-forest-900' : 'btn-outline'}`}
                >
                  <Clock className="w-4 h-4" />
                  قيد المراجعة
                </button>
                <button
                  onClick={() => updateStatus(selected.id, 'approved')}
                  className={`btn text-sm ${selected.status === 'approved' ? 'btn-primary' : 'btn-outline'}`}
                >
                  <CheckCircle className="w-4 h-4" />
                  اعتماد
                </button>
                <button
                  onClick={() => updateStatus(selected.id, 'rejected')}
                  className={`btn text-sm ${selected.status === 'rejected' ? 'btn-danger' : 'btn-outline'}`}
                >
                  <XCircle className="w-4 h-4" />
                  رفض
                </button>
              </div>
            </div>

            {/* Course enrollment (only for students) */}
            {selected.role === 'student' && (
              <div>
                <h4 className="font-bold text-forest-900 mb-2">الدورات المسجّل بها</h4>
                <div className="space-y-2">
                  {courses.length === 0 ? (
                    <p className="text-sm text-charcoal-400">لا توجد دورات مضافة بعد.</p>
                  ) : (
                    courses.map((c) => {
                      const enrolled = (enrollments[selected.id] || []).includes(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-cream-200 cursor-pointer hover:bg-cream-50">
                          <input
                            type="checkbox"
                            checked={enrolled}
                            onChange={() => toggleEnrollment(selected.id, c.id)}
                            className="w-5 h-5 accent-forest-700"
                          />
                          <div>
                            <p className="font-medium text-forest-900">{c.title}</p>
                            <p className="text-xs text-charcoal-400">{c.schedule_days?.join(' • ') || c.schedule}</p>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Student notes (supervisor + auto-absence) */}
            {selected.role === 'student' && (
              <StudentNotesSection studentId={selected.id} courses={courses} />
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function SessionForm({ categories, onClose, onSaved }: { categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'class' | 'match' | 'event'>('class');
  const [categoryId, setCategoryId] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await supabase.from('sessions').insert({
      title,
      session_type: type,
      category_id: categoryId || null,
      location,
    });
    setSaving(false);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title="حصة / مباراة جديدة">
      <div className="space-y-4">
        <div>
          <label className="label">العنوان</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="مثال: حصة القرآن - الأسبوع الأول" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">النوع</label>
            <select value={type} onChange={(e) => setType(e.target.value as 'class' | 'match' | 'event')} className="input">
              <option value="class">حصة</option>
              <option value="match">مباراة</option>
              <option value="event">فعالية</option>
            </select>
          </div>
          <div>
            <label className="label">الفئة</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
              <option value="">— اختر الفئة —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">المكان</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className="input" placeholder="مثال: ملعب الأكاديمية" />
        </div>
        <button onClick={save} disabled={saving || !title || !categoryId} className="btn btn-primary w-full">
          <Save className="w-4 h-4" />
          حفظ
        </button>
      </div>
    </Modal>
  );
}

// ============ ATTENDANCE (QR + Timer + Auto-Absence) ============
function AttendanceTab() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [students, setStudents] = useState<Profile[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [showSession, setShowSession] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerEnded, setTimerEnded] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const [{ data: courseData }, { data: sessionData }, { data: catData }] = await Promise.all([
      supabase.from('courses').select('*').order('title'),
      supabase.from('sessions').select('*').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('name'),
    ]);
    setCourses(courseData as Course[] || []);
    setSessions(sessionData as Session[] || []);
    setCategories(catData as Category[] || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Find the most recent session for a course (or create one)
  const startSession = async (course: Course) => {
    const now = new Date();
    const durationHours = course.session_duration_hours ? Number(course.session_duration_hours) : 1.5;
    const durationMs = durationHours * 60 * 60 * 1000;
    const endTime = new Date(now.getTime() + durationMs);

    // Deactivate any currently active sessions
    await supabase.from('sessions').update({ is_active: false }).eq('is_active', true);

    // Create a new session for this course
    const { data: newSession } = await supabase.from('sessions').insert({
      course_id: course.id,
      title: `${course.title} — ${formatDateArabic(now.toISOString())}`,
      session_type: 'class',
      location: '',
      start_time: now.toISOString(),
      end_time: endTime.toISOString(),
      is_active: true,
    }).select('*').single();

    if (newSession) {
      const s = newSession as Session;
      setActiveSession(s);
      setTimerSeconds(Math.floor(durationMs / 1000));
      setTimerRunning(true);
      setTimerEnded(false);
      load();
    }
  };

  const startTemplate = async (template: Session) => {
    await supabase.from('sessions').update({ is_active: false }).eq('is_active', true);
    await supabase.from('sessions').update({ is_active: true }).eq('id', template.id);
    setActiveSession({ ...template, is_active: true });
    setTimerSeconds(5400);
    setTimerRunning(true);
    setTimerEnded(false);
  };

  // Timer countdown
  useEffect(() => {
    if (timerRunning && timerSeconds > 0) {
      timerRef.current = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setTimerRunning(false);
            setTimerEnded(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [timerRunning]);



  const markAbsentees = async (session: Session) => {
    const { data: allStudents } = await supabase.from('profiles')
      .select('*').eq('role', 'student').eq('status', 'approved');
    const studentList = allStudents as Profile[] || [];

    const { data: attData } = await supabase.from('attendance')
      .select('*').eq('session_id', session.id);
    const attList = attData as Attendance[] || [];
    const presentIds = new Set(attList.filter((a) => a.status !== 'absent').map((a) => a.student_id));

    const absentees = studentList.filter((s) => !presentIds.has(s.id));
    const sessionTitle = session.title.split(' — ')[0] || session.title;
    const { weekNumber, year } = getCurrentWeekYear();
    const ABSENCE_DEDUCTION = 5;

    for (const student of absentees) {
      await supabase.from('attendance').insert({
        student_id: student.id,
        session_id: session.id,
        status: 'absent',
        points_deducted: ABSENCE_DEDUCTION,
      });

      if (session.category_id) {
        const { data: existingEval } = await supabase.from('evaluations')
          .select('*').eq('student_id', student.id).eq('category_id', session.category_id)
          .eq('week_number', weekNumber).eq('year', year).single();
        if (existingEval) {
          await supabase.from('evaluations').update({
            points_deducted: (existingEval.points_deducted || 0) + ABSENCE_DEDUCTION,
          }).eq('id', existingEval.id);
        } else {
          await supabase.from('evaluations').insert({
            student_id: student.id,
            category_id: session.category_id,
            week_number: weekNumber,
            year,
            points_deducted: ABSENCE_DEDUCTION,
            note: '',
          });
        }
      }

      await supabase.from('student_notes').insert({
        student_id: student.id,
        course_id: session.course_id,
        session_id: session.id,
        category_id: session.category_id,
        note: `غياب تلقائي عن حصة ${sessionTitle} - خصم ${ABSENCE_DEDUCTION} نقاط`,
        note_type: 'absence',
        points_impact: -ABSENCE_DEDUCTION,
      });

      await createNotification(student.id, 'غياب تلقائي', `لم يتم تسجيل حضورك في ${sessionTitle}`, 'attendance');
    }

    if (absentees.length > 0) {
      loadAttendance(session.id);
    }
  };

  const endSessionEarly = async () => {
    if (!activeSession) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
    setTimerEnded(true);
    await markAbsentees(activeSession);
  };

  const pauseTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
  };

  const resumeTimer = () => {
    if (timerSeconds > 0) setTimerRunning(true);
  };

  const deleteSession = async (session: Session) => {
    await supabase.from('attendance').delete().eq('session_id', session.id);
    await supabase.from('sessions').delete().eq('id', session.id);
    setSessionToDelete(null);
    load();
  };

  const closeSession = async () => {
    if (activeSession) {
      const now = new Date().toISOString();
      if (!activeSession.start_time) {
        const { data: completed } = await supabase.from('sessions').insert({
          title: activeSession.title,
          session_type: activeSession.session_type,
          category_id: activeSession.category_id,
          course_id: activeSession.course_id,
          location: activeSession.location,
          start_time: now,
          end_time: now,
          is_active: false,
        }).select('*').single();
        if (completed) {
          await supabase.from('attendance').update({ session_id: completed.id }).eq('session_id', activeSession.id);
          await supabase.from('student_notes').update({ session_id: completed.id }).eq('session_id', activeSession.id);
        }
        await supabase.from('sessions').update({ is_active: false }).eq('id', activeSession.id);
      } else {
        await supabase.from('sessions').update({ is_active: false, end_time: now }).eq('id', activeSession.id);
      }
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setActiveSession(null);
    setTimerRunning(false);
    setTimerEnded(false);
    setTimerSeconds(0);
    load();
  };

  const loadAttendance = useCallback(async (sessionId: string) => {
    const [{ data: attData }, { data: studentData }] = await Promise.all([
      supabase.from('attendance').select('*').eq('session_id', sessionId),
      supabase.from('profiles').select('*').eq('role', 'student').eq('status', 'approved').order('full_name'),
    ]);
    setAttendance(attData as Attendance[] || []);
    setStudents(studentData as Profile[] || []);
  }, []);

  useEffect(() => {
    if (!activeSession) return;
    loadAttendance(activeSession.id);

    const generateQr = async () => {
      const payload = await generateQrPayload(activeSession.id, sessionSecret(activeSession.id));
      const url = await QRCode.toDataURL(payload, { width: 300, margin: 2, color: { dark: '#132E20', light: '#FDFBF7' } });
      setQrDataUrl(url);
    };
    generateQr();
    const interval = setInterval(generateQr, 60000);
    return () => clearInterval(interval);
  }, [activeSession, loadAttendance]);

  const setManualAttendance = async (studentId: string, status: 'present' | 'late' | 'absent') => {
    if (!activeSession) return;
    const existing = attendance.find((a) => a.student_id === studentId);
    const wasAbsent = existing?.status === 'absent';
    const pointsDeducted = status === 'absent' ? 5 : 0;
    if (existing) {
      await supabase.from('attendance').update({ status, points_deducted: pointsDeducted }).eq('id', existing.id);
    } else {
      await supabase.from('attendance').insert({ student_id: studentId, session_id: activeSession.id, status, points_deducted: pointsDeducted });
    }

    if (status === 'absent' && !wasAbsent && activeSession.category_id) {
      const { weekNumber, year } = getCurrentWeekYear();
      const sessionTitle = activeSession.title.split(' — ')[0] || activeSession.title;
      const { data: existingEval } = await supabase.from('evaluations')
        .select('*').eq('student_id', studentId).eq('category_id', activeSession.category_id)
        .eq('week_number', weekNumber).eq('year', year).single();
      if (existingEval) {
        await supabase.from('evaluations').update({
          points_deducted: (existingEval.points_deducted || 0) + 5,
        }).eq('id', existingEval.id);
      } else {
        await supabase.from('evaluations').insert({
          student_id: studentId,
          category_id: activeSession.category_id,
          week_number: weekNumber,
          year,
          points_deducted: 5,
          note: '',
        });
      }
      await supabase.from('student_notes').insert({
        student_id: studentId,
        course_id: activeSession.course_id,
        session_id: activeSession.id,
        category_id: activeSession.category_id,
        note: `غياب تلقائي عن حصة ${sessionTitle} - خصم 5 نقاط`,
        note_type: 'absence',
        points_impact: -5,
      });
    }

    await createNotification(studentId, 'تحديث الحضور', `تم تسجيل حضورك كـ "${status === 'present' ? 'حاضر' : status === 'late' ? 'متأخر' : 'غائب'}" في ${activeSession.title}`, 'attendance');
    loadAttendance(activeSession.id);
  };

  const formatTimer = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) return <Loading />;

  // Session active view
  if (activeSession) {
    const course = courses.find((c) => c.id === activeSession.course_id);
    return (
      <div className="space-y-6">
        <div className="card flex items-center justify-between">
          <div>
            <p className="font-bold text-forest-900">{activeSession.title}</p>
            <p className="text-sm text-charcoal-500">
              {course?.time_notes || (activeSession.start_time && activeSession.end_time
                ? `${formatTimeArabic(activeSession.start_time)} - ${formatTimeArabic(activeSession.end_time)}`
                : 'قالب حصة — بدون وقت محدد')}
            </p>
          </div>
          <button onClick={closeSession} className="btn btn-outline text-sm">
            <X className="w-4 h-4" />
            إنهاء الحصة
          </button>
        </div>

        {/* Timer */}
        <div className={`card text-center ${timerEnded ? 'bg-red-50 border-red-200' : timerRunning ? 'bg-forest-50 border-forest-200' : 'bg-cream-50'}`}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock className={`w-6 h-6 ${timerEnded ? 'text-red-500' : 'text-forest-700'}`} />
            <span className="text-sm font-bold text-charcoal-600">{timerEnded ? 'انتهت الحصة' : timerRunning ? 'الحصة جارية' : 'متوقف مؤقتاً'}</span>
          </div>
          <p className={`text-5xl font-bold mb-4 ${timerEnded ? 'text-red-600' : 'text-forest-900'}`}>{formatTimer(timerSeconds)}</p>
          {timerEnded ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center justify-center gap-2 text-sm text-red-600">
                <AlertTriangle className="w-5 h-5" />
                انتهت مدة الحصة — اضغط «إنهاء الحصة» للإنهاء، أو «إنهاء وتسجيل الغياب» لتسجيل الغياب
              </div>
              <button onClick={endSessionEarly} className="btn btn-primary text-sm">
                <AlertTriangle className="w-4 h-4" />
                إنهاء وتسجيل الغياب
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              {timerRunning ? (
                <button onClick={pauseTimer} className="btn btn-outline text-sm">
                  <Pause className="w-4 h-4" />
                  إيقاف مؤقت
                </button>
              ) : (
                <button onClick={resumeTimer} className="btn btn-outline text-sm">
                  <Play className="w-4 h-4" />
                  استئناف
                </button>
              )}
              <button onClick={endSessionEarly} className="btn btn-primary text-sm">
                <AlertTriangle className="w-4 h-4" />
                إنهاء وتسجيل الغياب
              </button>
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* QR Display */}
          {!timerEnded && (
            <div className="card text-center">
              <h4 className="font-bold text-forest-900 mb-2">رمز الحضور الديناميكي</h4>
              <p className="text-sm text-charcoal-500 mb-4">يتجدد كل 60 ثانية — اطلب من الطلاب مسحه</p>
              {qrDataUrl ? (
                <div className="relative inline-block animate-fade-in">
                  <img src={qrDataUrl} alt="QR Code" className="rounded-xl mx-auto" />
                  <div className="absolute top-2 right-2 bg-gold-400 text-forest-900 text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                    مباشر
                  </div>
                </div>
              ) : <Loading />}
            </div>
          )}

          {/* Attendance list */}
          <div className={`card ${timerEnded ? 'lg:col-span-2' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-forest-900">سجل الحضور</h4>
              <button onClick={() => setManualOpen(!manualOpen)} className="btn btn-outline text-sm">
                <Edit className="w-4 h-4" />
                تسجيل يدوي
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {students.map((s) => {
                const att = attendance.find((a) => a.student_id === s.id);
                return (
                  <div key={s.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-cream-50">
                    <span className="text-sm font-medium text-charcoal-700">{s.full_name}</span>
                    {manualOpen ? (
                      <div className="flex gap-1">
                        <button onClick={() => setManualAttendance(s.id, 'present')} className={`px-2 py-1 rounded-lg text-xs ${att?.status === 'present' ? 'bg-green-500 text-white' : 'bg-cream-100 text-charcoal-500'}`}>حاضر</button>
                        <button onClick={() => setManualAttendance(s.id, 'late')} className={`px-2 py-1 rounded-lg text-xs ${att?.status === 'late' ? 'bg-gold-400 text-forest-900' : 'bg-cream-100 text-charcoal-500'}`}>متأخر</button>
                        <button onClick={() => setManualAttendance(s.id, 'absent')} className={`px-2 py-1 rounded-lg text-xs ${att?.status === 'absent' ? 'bg-red-500 text-white' : 'bg-cream-100 text-charcoal-500'}`}>غائب</button>
                      </div>
                    ) : att ? (
                      <Badge color={att.status === 'present' ? 'green' : att.status === 'late' ? 'gold' : 'red'}>
                        {att.status === 'present' ? 'حاضر' : att.status === 'late' ? 'متأخر' : 'غائب'}
                      </Badge>
                    ) : (
                      <Badge color="gray">لم يُسجل</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Course picker view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-forest-900">اختيار فئة لبدء الحصة</h3>
        <button onClick={() => setShowSession(true)} className="btn btn-gold text-sm">
          <Plus className="w-4 h-4" />
          حصة جديدة
        </button>
      </div>

      {courses.length === 0 ? (
        <EmptyState icon={<Calendar className="w-8 h-8" />} title="لا توجد فئات متاحة" subtitle="استخدم زر حصة جديدة لإنشاء حصة" />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((c) => {
            const courseSessions = sessions.filter((s) => s.course_id === c.id);
            const activeS = courseSessions.find((s) => s.is_active);
            return (
              <div key={c.id} className="card hover:shadow-lg transition-shadow">
                <div className="mb-3">
                  <p className="font-bold text-forest-900">{c.title}</p>
                  {c.schedule_days && c.schedule_days.length > 0 && (
                    <p className="text-xs text-charcoal-400 mt-1">{c.schedule_days.join(' • ')}</p>
                  )}
                  {c.session_duration_hours && Number(c.session_duration_hours) > 0 && (
                    <p className="text-xs text-forest-600 mt-1">مدة الحصة: {c.session_duration_hours} ساعة</p>
                  )}
                  {c.time_notes && (
                    <p className="text-xs text-gold-600 mt-1">{c.time_notes}</p>
                  )}
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-charcoal-400">الحصص السابقة: {courseSessions.length}</span>
                  {activeS && <Badge color="green">نشطة الآن</Badge>}
                </div>
                {activeS ? (
                  <button onClick={() => {
                    setActiveSession(activeS);
                    const remaining = activeS.end_time ? Math.floor((new Date(activeS.end_time).getTime() - Date.now()) / 1000) : 0;
                    setTimerSeconds(Math.max(0, remaining));
                    setTimerRunning(remaining > 0);
                    setTimerEnded(remaining <= 0);
                  }} className="btn btn-primary w-full text-sm">
                    <QrCode className="w-4 h-4" />
                    متابعة الحصة النشطة
                  </button>
                ) : (
                  <button onClick={() => startSession(c)} className="btn btn-primary w-full text-sm">
                    <Play className="w-4 h-4" />
                    بدء الحصة الآن
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Session templates */}
      {sessions.filter((s) => !s.start_time).length > 0 && (
        <div className="card">
          <h4 className="font-bold text-forest-900 mb-3">قوالب الحصص</h4>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sessions.filter((s) => !s.start_time).map((s) => (
              <div key={s.id} className="p-3 rounded-lg bg-cream-50 border border-cream-200">
                <div className="mb-2">
                  <p className="font-medium text-forest-900 text-sm">{s.title}</p>
                  <p className="text-xs text-charcoal-400">{s.location || '—'}</p>
                </div>
                {s.is_active ? (
                  <button onClick={() => {
                    setActiveSession(s);
                    const remaining = s.end_time ? Math.floor((new Date(s.end_time).getTime() - Date.now()) / 1000) : 0;
                    setTimerSeconds(Math.max(0, remaining));
                    setTimerRunning(remaining > 0);
                    setTimerEnded(remaining <= 0);
                  }} className="btn btn-primary w-full text-sm">
                    <QrCode className="w-4 h-4" />
                    متابعة الحصة النشطة
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => startTemplate(s)} className="btn btn-primary flex-1 text-sm">
                      <Play className="w-4 h-4" />
                      بدء الحصة
                    </button>
                    <button onClick={() => setSessionToDelete(s)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors" title="حذف">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent sessions history */}
      {sessions.filter((s) => !s.is_active && s.start_time).length > 0 && (
        <div className="card">
          <h4 className="font-bold text-forest-900 mb-3">سجل الحصص السابقة</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {sessions.filter((s) => !s.is_active && s.start_time).slice(0, 10).map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-cream-50">
                <div>
                  <p className="text-sm font-medium text-forest-900">{s.title}</p>
                  <p className="text-xs text-charcoal-400">{formatDateArabic(s.start_time)} • {formatTimeArabic(s.start_time)}</p>
                </div>
                <button onClick={() => setSessionToDelete(s)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors" title="حذف">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {showSession && <SessionForm categories={categories} onClose={() => setShowSession(false)} onSaved={() => { setShowSession(false); load(); }} />}
      <Modal open={!!sessionToDelete} onClose={() => setSessionToDelete(null)} title="تأكيد الحذف" size="sm">
        <div className="space-y-4">
          <p className="text-charcoal-600">هل أنت تأكد من حذف هذه الحصة؟</p>
          {sessionToDelete && (
            <div className="p-3 rounded-lg bg-cream-50">
              <p className="text-sm font-medium text-forest-900">{sessionToDelete.title}</p>
              {sessionToDelete.start_time && (
                <p className="text-xs text-charcoal-400">{formatDateArabic(sessionToDelete.start_time)} • {formatTimeArabic(sessionToDelete.start_time)}</p>
              )}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setSessionToDelete(null)} className="btn btn-outline text-sm">إلغاء</button>
            <button onClick={() => sessionToDelete && deleteSession(sessionToDelete)} className="btn btn-danger text-sm">
              <Trash2 className="w-4 h-4" />
              حذف
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============ EVALUATIONS ============
function EvaluationsTab() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null);
  const [editValues, setEditValues] = useState<Record<string, { deducted: number; note: string }>>({});
  const { weekNumber, year } = getCurrentWeekYear();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: studentData }, { data: catData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'student').eq('status', 'approved').order('full_name'),
      supabase.from('categories').select('*').order('name'),
    ]);
    setStudents(studentData as Profile[] || []);
    setCategories(catData as Category[] || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadEvaluations = useCallback(async (studentId: string) => {
    const { data } = await supabase.from('evaluations').select('*, category:category(*)').eq('student_id', studentId).eq('week_number', weekNumber).eq('year', year);
    setEvaluations(data as Evaluation[] || []);
    const evMap: Record<string, { deducted: number; note: string }> = {};
    (data as Evaluation[] || []).forEach((e) => {
      evMap[e.category_id] = { deducted: e.points_deducted, note: e.note };
    });
    setEditValues(evMap);
  }, [weekNumber, year]);

  useEffect(() => {
    if (selectedStudent) loadEvaluations(selectedStudent.id);
  }, [selectedStudent, loadEvaluations]);

  const saveEvaluation = async (categoryId: string) => {
    if (!selectedStudent) return;
    const val = editValues[categoryId] || { deducted: 0, note: '' };
    const existing = evaluations.find((e) => e.category_id === categoryId);
    if (existing) {
      await supabase.from('evaluations').update({ points_deducted: val.deducted, note: val.note }).eq('id', existing.id);
    } else {
      await supabase.from('evaluations').insert({
        student_id: selectedStudent.id,
        category_id: categoryId,
        week_number: weekNumber,
        year,
        points_deducted: val.deducted,
        note: val.note,
      });
    }
    const cat = categories.find((c) => c.id === categoryId);
    if (val.note) {
      await createNotification(selectedStudent.id, 'ملاحظة جديدة', `${cat?.name || 'تقييم'}: ${val.note}`, 'note');
    }
    loadEvaluations(selectedStudent.id);
  };

  if (loading) return <Loading />;

  if (!selectedStudent) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-forest-900">التقييم الأسبوعي — اختر الطالب</h3>
        {students.length === 0 ? (
          <EmptyState icon={<Star className="w-8 h-8" />} title="لا يوجد طلاب" />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {students.map((s) => (
              <button key={s.id} onClick={() => setSelectedStudent(s)} className="card text-right hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-forest-100 text-forest-800 flex items-center justify-center font-bold">
                    {s.full_name.charAt(0)}
                  </div>
                  <p className="font-bold text-forest-900">{s.full_name}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedStudent(null)} className="btn btn-outline text-sm">
            <X className="w-4 h-4" />
            رجوع
          </button>
          <h3 className="text-lg font-bold text-forest-900">تقييم: {selectedStudent.full_name}</h3>
        </div>
        <Badge color="gold">الأسبوع {weekNumber} - {year}</Badge>
      </div>

      <div className="space-y-3">
        {categories.map((cat) => {
          const val = editValues[cat.id] || { deducted: 0, note: '' };
          const fills = computeStarFills(val.deducted, cat.max_points);
          return (
            <div key={cat.id} className="card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-bold text-forest-900">{cat.name}</p>
                  <p className="text-xs text-charcoal-400">{cat.description}</p>
                </div>
                <StarRating fills={fills} size={20} />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">الخصم ({val.deducted}/{cat.max_points})</label>
                  <input
                    type="range"
                    min="0"
                    max={cat.max_points}
                    value={val.deducted}
                    onChange={(e) => setEditValues({ ...editValues, [cat.id]: { ...val, deducted: parseInt(e.target.value) } })}
                    className="w-full accent-forest-700"
                  />
                </div>
                <div>
                  <label className="label">ملاحظة</label>
                  <input
                    value={val.note}
                    onChange={(e) => setEditValues({ ...editValues, [cat.id]: { ...val, note: e.target.value } })}
                    className="input"
                    placeholder="ملاحظة للطالب..."
                  />
                </div>
              </div>
              <button onClick={() => saveEvaluation(cat.id)} className="btn btn-primary text-sm mt-3">
                <Save className="w-4 h-4" />
                حفظ التقييم
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ CATEGORIES ============
function CategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [managedCategory, setManagedCategory] = useState<Category | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('categories').select('*').order('name');
    setCategories(data as Category[] || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteCategory = async (id: string) => {
    if (!confirm('هل أنت متأكد؟ سيتم حذف جميع التقييمات المرتبطة.')) return;
    await supabase.from('categories').delete().eq('id', id);
    load();
  };

  if (loading) return <Loading />;

  if (managedCategory) {
    return <CategoryManage category={managedCategory} onBack={() => setManagedCategory(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-forest-900">فئات التقييم</h3>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn btn-gold text-sm">
          <Plus className="w-4 h-4" />
          فئة جديدة
        </button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map((c) => (
          <div key={c.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-forest-900">{c.name}</p>
                <p className="text-sm text-charcoal-500">{c.description}</p>
                <Badge color="gold">الحد الأقصى: {c.max_points} نقطة</Badge>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setManagedCategory(c)} className="p-1.5 rounded-lg hover:bg-forest-50 text-forest-700" title="إدارة المهام والرسوم">
                  <ClipboardCheck className="w-4 h-4" />
                </button>
                <button onClick={() => { setEditing(c); setShowForm(true); }} className="p-1.5 rounded-lg hover:bg-cream-100 text-charcoal-500">
                  <Edit className="w-4 h-4" />
                </button>
                <button onClick={() => deleteCategory(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {showForm && <CategoryForm category={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </div>
  );
}

function CategoryManage({ category, onBack }: { category: Category; onBack: () => void }) {
  const [students, setStudents] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dues, setDues] = useState<FinancialDue[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [newDueDesc, setNewDueDesc] = useState('');
  const [newDueAmount, setNewDueAmount] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: catEnrollData }, { data: profileData }, { data: taskData }, { data: dueData }] = await Promise.all([
      supabase.from('student_categories').select('student_id').eq('category_id', category.id),
      supabase.from('profiles').select('*').eq('role', 'student').eq('status', 'approved').order('full_name'),
      supabase.from('tasks').select('*').eq('category_id', category.id).order('created_at', { ascending: false }),
      supabase.from('financial_dues').select('*').eq('category_id', category.id).order('created_at', { ascending: false }),
    ]);
    const enrolledIds = new Set((catEnrollData || []).map((e: any) => e.student_id));
    setStudents((profileData as Profile[] || []).filter((s) => enrolledIds.has(s.id)));
    setTasks(taskData as Task[] || []);
    setDues(dueData as FinancialDue[] || []);
    setLoading(false);
  }, [category.id]);

  useEffect(() => { load(); }, [load]);

  const addTask = async () => {
    if (!selectedStudent || !newTaskTitle) return;
    await supabase.from('tasks').insert({
      student_id: selectedStudent.id,
      category_id: category.id,
      title: newTaskTitle,
      description: newTaskDesc,
      due_date: newTaskDue || null,
    });
    await createNotification(selectedStudent.id, 'مهمة جديدة', `${newTaskTitle} — ${category.name}`, 'general');
    setNewTaskTitle('');
    setNewTaskDesc('');
    setNewTaskDue('');
    load();
  };

  const toggleTask = async (task: Task) => {
    await supabase.from('tasks').update({ completed: !task.completed }).eq('id', task.id);
    load();
  };

  const deleteTask = async (id: string) => {
    await supabase.from('tasks').delete().eq('id', id);
    load();
  };

  const addDue = async () => {
    if (!selectedStudent || !newDueDesc || !newDueAmount) return;
    await supabase.from('financial_dues').insert({
      student_id: selectedStudent.id,
      category_id: category.id,
      description: newDueDesc,
      amount: parseFloat(newDueAmount),
    });
    await createNotification(selectedStudent.id, 'رسوم جديدة', `${newDueDesc}: ${newDueAmount} — ${category.name}`, 'financial');
    setNewDueDesc('');
    setNewDueAmount('');
    load();
  };

  const togglePaid = async (due: FinancialDue) => {
    const newStatus = due.status === 'unpaid' ? 'paid' : 'unpaid';
    await supabase.from('financial_dues').update({ status: newStatus }).eq('id', due.id);
    load();
  };

  const deleteDue = async (id: string) => {
    await supabase.from('financial_dues').delete().eq('id', id);
    load();
  };

  if (loading) return <Loading />;

  const studentTasks = selectedStudent ? tasks.filter((t) => t.student_id === selectedStudent.id) : [];
  const studentDues = selectedStudent ? dues.filter((d) => d.student_id === selectedStudent.id) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="btn btn-outline text-sm">
          <X className="w-4 h-4" />
          رجوع
        </button>
        <div>
          <h3 className="text-lg font-bold text-forest-900">{category.name}</h3>
          <p className="text-sm text-charcoal-500">إدارة المهام والمستحقات المالية لكل طالب</p>
        </div>
      </div>

      {students.length === 0 ? (
        <EmptyState icon={<Users className="w-8 h-8" />} title="لا يوجد طلاب مسجلون في هذه الفئة" />
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Student list */}
          <div className="space-y-2">
            <h4 className="font-bold text-forest-900 text-sm mb-2">الطلاب المسجلون</h4>
            {students.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedStudent(s)}
                className={`w-full text-right p-3 rounded-xl border transition-colors ${selectedStudent?.id === s.id ? 'border-forest-300 bg-forest-50' : 'border-cream-200 hover:bg-cream-50'}`}
              >
                <p className="font-medium text-forest-900 text-sm">{s.full_name}</p>
                <p className="text-xs text-charcoal-400">
                  {tasks.filter((t) => t.student_id === s.id).length} مهمة • {dues.filter((d) => d.student_id === s.id).length} رسوم
                </p>
              </button>
            ))}
          </div>

          {/* Task + Due management for selected student */}
          {selectedStudent ? (
            <div className="lg:col-span-2 space-y-4">
              {/* Tasks */}
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <ClipboardCheck className="w-4 h-4 text-forest-700" />
                  <h4 className="font-bold text-forest-900">المهام — {selectedStudent.full_name}</h4>
                </div>
                <div className="space-y-2 mb-4">
                  {studentTasks.length === 0 ? (
                    <p className="text-sm text-charcoal-400">لا توجد مهام لهذا الطالب في هذه الفئة</p>
                  ) : (
                    studentTasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-cream-200">
                        <button onClick={() => toggleTask(t)} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${t.completed ? 'bg-forest-600 border-forest-600' : 'border-charcoal-300'}`}>
                          {t.completed && <CheckCircle className="w-3 h-3 text-white" />}
                        </button>
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${t.completed ? 'line-through text-charcoal-400' : 'text-forest-900'}`}>{t.title}</p>
                          {t.description && <p className="text-xs text-charcoal-400">{t.description}</p>}
                          {t.due_date && <p className="text-xs text-gold-700">موعد: {formatDateArabic(t.due_date)}</p>}
                        </div>
                        <button onClick={() => deleteTask(t.id)} className="p-1 rounded-lg hover:bg-red-50 text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2 pt-3 border-t border-cream-200">
                  <input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} className="input" placeholder="عنوان المهمة" />
                  <input value={newTaskDesc} onChange={(e) => setNewTaskDesc(e.target.value)} className="input" placeholder="وصف المهمة (اختياري)" />
                  <div className="flex gap-2">
                    <input type="date" value={newTaskDue} onChange={(e) => setNewTaskDue(e.target.value)} className="input flex-1" />
                    <button onClick={addTask} disabled={!newTaskTitle} className="btn btn-primary text-sm whitespace-nowrap">
                      <Plus className="w-4 h-4" />
                      إضافة مهمة
                    </button>
                  </div>
                </div>
              </div>

              {/* Financial Dues */}
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="w-4 h-4 text-forest-700" />
                  <h4 className="font-bold text-forest-900">المستحقات المالية — {selectedStudent.full_name}</h4>
                </div>
                <div className="space-y-2 mb-4">
                  {studentDues.length === 0 ? (
                    <p className="text-sm text-charcoal-400">لا توجد مستحقات لهذا الطالب في هذه الفئة</p>
                  ) : (
                    studentDues.map((d) => (
                      <div key={d.id} className="flex items-center justify-between p-2.5 rounded-lg border border-cream-200">
                        <div>
                          <p className="text-sm font-medium text-forest-900">{d.description}</p>
                          <p className="text-xs text-charcoal-400">${d.amount} • {formatDateArabic(d.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => togglePaid(d)} className={`badge cursor-pointer ${d.status === 'unpaid' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {d.status === 'unpaid' ? 'غير مدفوع' : 'مدفوع'}
                          </button>
                          <button onClick={() => deleteDue(d.id)} className="p-1 rounded-lg hover:bg-red-50 text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2 pt-3 border-t border-cream-200">
                  <input value={newDueDesc} onChange={(e) => setNewDueDesc(e.target.value)} className="input" placeholder="الوصف" />
                  <input type="number" step="0.01" value={newDueAmount} onChange={(e) => setNewDueAmount(e.target.value)} className="input w-28" placeholder="$" />
                  <button onClick={addDue} disabled={!newDueDesc || !newDueAmount} className="btn btn-primary text-sm whitespace-nowrap">
                    <Plus className="w-4 h-4" />
                    إضافة رسوم
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="lg:col-span-2 flex items-center justify-center">
              <p className="text-charcoal-400 text-sm">اختر طالباً لإدارة مهامه ومستحقاته</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryForm({ category, onClose, onSaved }: { category: Category | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(category?.name || '');
  const [description, setDescription] = useState(category?.description || '');
  const [maxPoints, setMaxPoints] = useState(category?.max_points || 25);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    if (category) {
      await supabase.from('categories').update({ name, description, max_points: maxPoints }).eq('id', category.id);
    } else {
      await supabase.from('categories').insert({ name, description, max_points: maxPoints });
    }
    setSaving(false);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={category ? 'تعديل فئة' : 'فئة جديدة'}>
      <div className="space-y-4">
        <div>
          <label className="label">اسم الفئة</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="مثال: الأخلاق" />
        </div>
        <div>
          <label className="label">الوصف</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">الحد الأقصى للنقاط</label>
          <input type="number" value={maxPoints} onChange={(e) => setMaxPoints(parseInt(e.target.value) || 25)} className="input" />
        </div>
        <button onClick={save} disabled={saving || !name} className="btn btn-primary w-full">
          <Save className="w-4 h-4" />
          حفظ
        </button>
      </div>
    </Modal>
  );
}

// ============ FINANCIAL ============
function FinancialTab() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [dues, setDues] = useState<FinancialDue[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCatId, setNewCatId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: profileData }, { data: catData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'student').eq('status', 'approved').order('full_name'),
      supabase.from('categories').select('*').order('name'),
    ]);
    setStudents(profileData as Profile[] || []);
    setCategories(catData as Category[] || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadDues = useCallback(async (studentId: string) => {
    const { data } = await supabase.from('financial_dues').select('*').eq('student_id', studentId).order('created_at', { ascending: false });
    setDues(data as FinancialDue[] || []);
  }, []);

  useEffect(() => {
    if (selected) loadDues(selected.id);
  }, [selected, loadDues]);

  const togglePaid = async (due: FinancialDue) => {
    const newStatus = due.status === 'unpaid' ? 'paid' : 'unpaid';
    await supabase.from('financial_dues').update({ status: newStatus }).eq('id', due.id);
    if (newStatus === 'paid' && selected) {
      await createNotification(selected.id, 'تحديث مالي', `تم تسديد "${due.description}" بمبلغ $${due.amount}`, 'financial');
    }
    if (selected) loadDues(selected.id);
  };

  const addDue = async () => {
    if (!selected || !newDesc || !newAmount) return;
    await supabase.from('financial_dues').insert({
      student_id: selected.id,
      category_id: newCatId || null,
      description: newDesc,
      amount: parseFloat(newAmount),
    });
    await createNotification(selected.id, 'رسوم جديدة', `${newDesc}: ${newAmount}`, 'financial');
    setNewDesc('');
    setNewAmount('');
    setNewCatId('');
    setShowAdd(false);
    loadDues(selected.id);
  };

  const deleteDue = async (id: string) => {
    await supabase.from('financial_dues').delete().eq('id', id);
    if (selected) loadDues(selected.id);
  };

  if (loading) return <Loading />;

  if (!selected) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-forest-900">الإدارة المالية — اختر الطالب</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {students.map((s) => (
            <button key={s.id} onClick={() => setSelected(s)} className="card text-right hover:shadow-lg transition-shadow">
              <p className="font-bold text-forest-900">{s.full_name}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const totalUnpaid = dues.filter((d) => d.status === 'unpaid').reduce((s, d) => s + Number(d.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="btn btn-outline text-sm">
            <X className="w-4 h-4" />
            رجوع
          </button>
          <h3 className="text-lg font-bold text-forest-900">{selected.full_name}</h3>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn btn-gold text-sm">
          <Plus className="w-4 h-4" />
          إضافة رسوم
        </button>
      </div>

      <div className="card bg-forest-900 text-cream-50">
        <p className="text-cream-300 text-sm">إجمالي المستحقات غير المدفوعة</p>
        <p className="text-3xl font-bold text-gold-400">${totalUnpaid}</p>
      </div>

      {dues.length === 0 ? (
        <EmptyState icon={<DollarSign className="w-8 h-8" />} title="لا توجد رسوم" />
      ) : (
        <div className="space-y-2">
          {dues.map((d) => (
            <div key={d.id} className="card flex items-center justify-between">
              <div>
                <p className="font-medium text-forest-900">{d.description}</p>
                <p className="text-sm text-charcoal-500">${d.amount} • {formatDateArabic(d.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => togglePaid(d)} className={`badge cursor-pointer ${d.status === 'unpaid' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                  {d.status === 'unpaid' ? 'غير مدفوع' : 'مدفوع'}
                </button>
                <button onClick={() => deleteDue(d.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal open onClose={() => setShowAdd(false)} title="إضافة رسوم جديدة">
          <div className="space-y-4">
            <div>
              <label className="label">الوصف</label>
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="input" placeholder="مثال: حجز ملعب" />
            </div>
            <div>
              <label className="label">المبلغ ($)</label>
              <input type="number" step="0.01" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} className="input" placeholder="2.00" />
            </div>
            <div>
              <label className="label">الفئة (اختياري)</label>
              <select value={newCatId} onChange={(e) => setNewCatId(e.target.value)} className="input">
                <option value="">— بدون فئة —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button onClick={addDue} disabled={!newDesc || !newAmount} className="btn btn-primary w-full">
              <Save className="w-4 h-4" />
              حفظ
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============ SETTINGS ============
function SettingsTab() {
  const { session } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updatePassword = async () => {
    setMessage(null);
    setError(null);
    if (newPassword.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    const { error: err } = await supabase.auth.updateUser({ password: newPassword });
    if (err) {
      setError(err.message);
    } else {
      setMessage('تم تحديث كلمة المرور بنجاح');
      setNewPassword('');
    }
  };

  return (
    <div className="max-w-md space-y-4">
      <h3 className="text-lg font-bold text-forest-900">الإعدادات</h3>
      <div className="card">
        <h4 className="font-bold text-forest-900 mb-2">تغيير كلمة المرور</h4>
        <p className="text-sm text-charcoal-500 mb-4">البريد: {session?.user?.email}</p>
        <div className="space-y-3">
          <div>
            <label className="label">كلمة المرور الجديدة</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}
          <button onClick={updatePassword} disabled={!newPassword} className="btn btn-primary w-full">
            <Save className="w-4 h-4" />
            تحديث
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Star, BookOpen, DollarSign, ClipboardList, Calendar, QrCode, X, Award, TrendingUp,
  Clock, MapPin, CircleCheck as CheckCircle, CircleAlert as AlertCircle, StickyNote,
  LayoutDashboard, Send, Play, History, Info,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Modal } from '@/components/Modal';
import { Loading, EmptyState, Badge } from '@/components/ui';
import { StarRating } from '@/components/StarRating';
import { computeStarFills, getCategoryStars, getCurrentWeekYear, computeCoursePoints } from '@/lib/scoring';
import { verifyQrPayload, sessionSecret } from '@/lib/qr';
import { formatDateArabic, formatTimeArabic } from '@/lib/date';
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS, isTaskOverdue, normalizeTaskStatus, taskProgressPercent } from '@/lib/tasks';
import { financeSummary, PAYMENT_METHOD_LABELS } from '@/lib/finances';
import type {
  Category, Evaluation, Session, FinancialDue, FinancialPayment, Task, TaskStatus,
  Attendance, StudentNote, Course, AppSettings,
} from '@/lib/types';

type PortalTab = 'home' | 'tasks' | 'finances' | 'progress';

export default function StudentPortal() {
  const { profile } = useAuth();
  const [portalTab, setPortalTab] = useState<PortalTab>('home');
  const [categories, setCategories] = useState<Category[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [allEvaluations, setAllEvaluations] = useState<Evaluation[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [dues, setDues] = useState<FinancialDue[]>([]);
  const [payments, setPayments] = useState<FinancialPayment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
  const [coursePoints, setCoursePoints] = useState<Record<string, number>>({});
  const [basePoints, setBasePoints] = useState(100);
  const [loading, setLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [submitTask, setSubmitTask] = useState<Task | null>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [taskFilter, setTaskFilter] = useState<TaskStatus | 'all'>('all');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningPaused = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { weekNumber, year } = getCurrentWeekYear();

  const load = useCallback(async () => {
    if (!profile) return;
    const [
      cats, evals, allEvals, sess, duesData, paymentsData, tasksData,
      attData, notesData, courseData, enrollData, catEnrollData, settingsRes,
    ] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('evaluations').select('*, category:categories(*)').eq('student_id', profile.id).eq('week_number', weekNumber).eq('year', year),
      supabase.from('evaluations').select('*, category:categories(*)').eq('student_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('sessions').select('*').gte('end_time', new Date().toISOString()).order('start_time'),
      supabase.from('financial_dues').select('*, category:categories(id, name)').eq('student_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('financial_payments').select('*').eq('student_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('tasks').select('*, category:categories(id, name)').eq('student_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('attendance').select('*, session:sessions(*)').eq('student_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('student_notes').select('*').eq('student_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('courses').select('*').order('title'),
      supabase.from('student_courses').select('course_id').eq('student_id', profile.id),
      supabase.from('student_categories').select('category_id').eq('student_id', profile.id),
      supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
    ]);

    const enrolledCatIds = new Set((catEnrollData.data || []).map((e: { category_id: string }) => e.category_id));
    const allCategories = (cats.data as Category[]) || [];
    setCategories(allCategories.filter((c) => enrolledCatIds.has(c.id)));
    setEvaluations((evals.data as Evaluation[] || []).filter((e) => !e.category_id || enrolledCatIds.has(e.category_id)));
    const filteredAllEvals = (allEvals.data as Evaluation[] || []).filter((e) => !e.category_id || enrolledCatIds.has(e.category_id));
    setAllEvaluations(filteredAllEvals);
    setSessions((sess.data as Session[] || []).filter((s) => !s.category_id || enrolledCatIds.has(s.category_id)));
    setDues((duesData.data as FinancialDue[] || []).filter((d) => !d.category_id || enrolledCatIds.has(d.category_id)));
    setPayments(paymentsData.data as FinancialPayment[] || []);
    setTasks((tasksData.data as Task[] || []).filter((t) => !t.category_id || enrolledCatIds.has(t.category_id)));
    setAttendance(attData.data as Attendance[] || []);
    setNotes(notesData.data as StudentNote[] || []);
    const allCourses = courseData.data as Course[] || [];
    const enrolledIds = (enrollData.data || []).map((e: { course_id: string }) => e.course_id);
    setEnrolledCourses(allCourses.filter((c) => enrolledIds.includes(c.id)));

    const settings = settingsRes.data as AppSettings | null;
    const bp = settings?.base_points ?? 100;
    setBasePoints(bp);

    const pointsMap: Record<string, number> = {};
    for (const c of allCourses.filter((co) => enrolledIds.includes(co.id))) {
      pointsMap[c.id] = computeCoursePoints(c.id, bp, filteredAllEvals, (notesData.data as StudentNote[]) || []);
    }
    setCoursePoints(pointsMap);
    setLoading(false);
  }, [profile, weekNumber, year]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('student-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evaluations', filter: `student_id=eq.${profile.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_dues', filter: `student_id=eq.${profile.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_payments', filter: `student_id=eq.${profile.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `student_id=eq.${profile.id}` }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sessions' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `student_id=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, load]);

  const updateTaskStatus = async (task: Task, status: TaskStatus, extra: Record<string, unknown> = {}) => {
    await supabase.from('tasks').update({
      status,
      completed: status === 'completed',
      updated_at: new Date().toISOString(),
      ...extra,
    }).eq('id', task.id);
    load();
  };

  const handleSubmitTask = async () => {
    if (!submitTask || !submissionText.trim()) return;
    await updateTaskStatus(submitTask, 'submitted', {
      submission_text: submissionText.trim(),
      submitted_at: new Date().toISOString(),
    });
    setSubmitTask(null);
    setSubmissionText('');
  };

  const startScanner = async () => {
    setScannerOpen(true);
    setScanResult(null);
    setShowSuccessOverlay(false);
    isScanningPaused.current = false;
    setTimeout(async () => {
      try {
        const html5Qr = new Html5Qrcode('qr-reader');
        scannerRef.current = html5Qr;
        await html5Qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => { await handleScan(decodedText); },
          () => {}
        );
      } catch {
        setScanResult({ success: false, message: 'تعذر الوصول إلى الكاميرا. تأكد من السماح بالوصول.' });
      }
    }, 300);
  };

  const stopScanner = async () => {
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    isScanningPaused.current = false;
    setShowSuccessOverlay(false);
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); await scannerRef.current.clear(); } catch { /* noop */ }
      scannerRef.current = null;
    }
    setScannerOpen(false);
  };

  const handleScan = async (payload: string) => {
    if (!profile || isScanningPaused.current) return;
    isScanningPaused.current = true;
    try {
      const parsed = JSON.parse(payload);
      const verifyResult = await verifyQrPayload(payload, sessionSecret(parsed.s as string));
      if (!verifyResult.valid || !verifyResult.sessionId) {
        setScanResult({ success: false, message: 'رمز غير صالح أو منتهي الصلاحية' });
        isScanningPaused.current = false;
        return;
      }
      const sessionId = verifyResult.sessionId;
      const { data: existing } = await supabase.from('attendance').select('*').eq('student_id', profile.id).eq('session_id', sessionId).maybeSingle();
      if (existing) {
        setScanResult({ success: false, message: 'تم تسجيل حضورك مسبقاً لهذه الحصة' });
        isScanningPaused.current = false;
        return;
      }
      const { data: sessionRow } = await supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle();
      if (!sessionRow) {
        setScanResult({ success: false, message: 'الحصة غير موجودة' });
        isScanningPaused.current = false;
        return;
      }
      if (!sessionRow.is_active) {
        setScanResult({ success: false, message: 'الحصة غير نشطة حالياً. اطلب من الشيخ تفعيلها.' });
        isScanningPaused.current = false;
        return;
      }
      const now = new Date();
      const start = sessionRow.start_time ? new Date(sessionRow.start_time) : now;
      const lateThreshold = new Date(start.getTime() + 15 * 60000);
      const status = now > lateThreshold ? 'late' : 'present';
      await supabase.from('attendance').insert({ student_id: profile.id, session_id: sessionId, status, points_deducted: 0 });
      setScanResult({ success: true, message: status === 'late' ? 'تم تسجيل حضورك (متأخر)' : 'تم تسجيل الحضور بنجاح' });
      setShowSuccessOverlay(true);
      load();
      cooldownTimerRef.current = setTimeout(() => {
        setShowSuccessOverlay(false);
        setScanResult(null);
        isScanningPaused.current = false;
      }, 5000);
    } catch {
      setScanResult({ success: false, message: 'رمز غير صالح' });
      isScanningPaused.current = false;
    }
  };

  const navItems = [
    { path: '/portal', label: 'البوابة', icon: <BookOpen className="w-5 h-5" /> },
  ];

  const portalTabs: { key: PortalTab; label: string; icon: React.ReactNode }[] = [
    { key: 'home', label: 'الرئيسية', icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: 'tasks', label: 'المهام', icon: <ClipboardList className="w-4 h-4" /> },
    { key: 'finances', label: 'المالية', icon: <DollarSign className="w-4 h-4" /> },
    { key: 'progress', label: 'التقدم', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  if (loading) return <DashboardLayout navItems={navItems}><Loading /></DashboardLayout>;

  const categoryStars = getCategoryStars(categories, evaluations);
  const overallPoints = enrolledCourses.length > 0
    ? Math.round(enrolledCourses.reduce((sum, c) => sum + (coursePoints[c.id] ?? basePoints), 0) / enrolledCourses.length)
    : basePoints;
  const overallPct = Math.round((overallPoints / basePoints) * 100);
  const finance = financeSummary(dues, payments);
  const pendingTasks = tasks.filter((t) => normalizeTaskStatus(t) !== 'completed');
  const overdueTasks = tasks.filter((t) => isTaskOverdue(t));
  const filteredTasks = taskFilter === 'all' ? tasks : tasks.filter((t) => normalizeTaskStatus(t) === taskFilter);
  const upcomingSessions = sessions.filter((s) => s.session_type === 'match' || s.session_type === 'event').slice(0, 5);
  const supervisorNotes = notes.filter((n) => ['supervisor', 'absence', 'excuse', 'custom'].includes(n.note_type)).slice(0, 5);

  return (
    <DashboardLayout navItems={navItems}>
      {/* Header */}
      <div className="mb-4 bg-forest-900 rounded-2xl p-6 text-cream-50 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-48 h-48 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">مرحباً، {profile?.full_name}</h1>
            <p className="text-cream-300 text-sm">بوابة الطالب — أكاديمية زاد الإحسان</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-forest-800/60 rounded-xl px-4 py-2 text-center border border-gold-400/20">
              <p className="text-xs text-cream-300">المعدل</p>
              <p className="text-xl font-bold text-gold-400">{overallPct}%</p>
            </div>
            <div className="bg-forest-800/60 rounded-xl px-4 py-2 text-center border border-gold-400/20">
              <p className="text-xs text-cream-300">مهام معلّقة</p>
              <p className="text-xl font-bold text-gold-400">{pendingTasks.length}</p>
            </div>
            <div className="bg-forest-800/60 rounded-xl px-4 py-2 text-center border border-gold-400/20">
              <p className="text-xs text-cream-300">مستحقات</p>
              <p className="text-xl font-bold text-gold-400">${finance.totalOwed.toFixed(0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Portal tab bar */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {portalTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setPortalTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap transition-all ${portalTab === t.key ? 'bg-forest-800 text-cream-50 font-bold' : 'bg-white text-charcoal-600 hover:bg-cream-100 border border-cream-200'}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* HOME TAB */}
      {portalTab === 'home' && (
        <div className="space-y-6">
          <button onClick={startScanner} className="btn btn-gold w-full text-base py-3.5">
            <QrCode className="w-5 h-5" />
            مسح رمز الحضور
          </button>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button onClick={() => setPortalTab('tasks')} className="card text-right hover:shadow-md transition-shadow">
              <ClipboardList className="w-6 h-6 text-forest-700 mb-2" />
              <p className="font-bold text-forest-900">{pendingTasks.length} مهمة معلّقة</p>
              <p className="text-xs text-charcoal-400">{overdueTasks.length} متأخرة • {taskProgressPercent(tasks)}% مكتمل</p>
            </button>
            <button onClick={() => setPortalTab('finances')} className="card text-right hover:shadow-md transition-shadow">
              <DollarSign className="w-6 h-6 text-forest-700 mb-2" />
              <p className="font-bold text-forest-900">${finance.totalOwed.toFixed(2)} مستحق</p>
              <p className="text-xs text-charcoal-400">${finance.totalPaidViaDues.toFixed(2)} مُسدَّد</p>
            </button>
            <div className="card">
              <BookOpen className="w-6 h-6 text-forest-700 mb-2" />
              <p className="font-bold text-forest-900">{enrolledCourses.length} دورة</p>
              <p className="text-xs text-charcoal-400">حفظ: {profile?.quran_progress}%</p>
            </div>
            <div className="card">
              <Award className="w-6 h-6 text-gold-500 mb-2" />
              <p className="font-bold text-forest-900">{overallPoints}/{basePoints} نقطة</p>
              <p className="text-xs text-charcoal-400">المعدل الأسبوعي</p>
            </div>
          </div>

          {pendingTasks.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-forest-900">مهام عاجلة</h3>
                <button onClick={() => setPortalTab('tasks')} className="text-sm text-forest-700 hover:underline">عرض الكل</button>
              </div>
              <div className="space-y-2">
                {pendingTasks.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-cream-50">
                    <div>
                      <p className="text-sm font-medium text-forest-900">{t.title}</p>
                      {t.due_date && <p className="text-xs text-charcoal-400">موعد: {formatDateArabic(t.due_date)}</p>}
                    </div>
                    <Badge color={TASK_STATUS_COLORS[normalizeTaskStatus(t)]}>{TASK_STATUS_LABELS[normalizeTaskStatus(t)]}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {supervisorNotes.length > 0 && (
            <div className="card">
              <h3 className="font-bold text-forest-900 mb-3">آخر الملاحظات</h3>
              <div className="space-y-2">
                {supervisorNotes.map((n) => (
                  <div key={n.id} className="p-3 rounded-xl bg-cream-50 text-sm text-charcoal-700">{n.note}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TASKS TAB */}
      {portalTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-forest-900">مهامي وواجباتي</h2>
              <p className="text-sm text-charcoal-500">تتبّع المواعيد، سلّم عملك، وأكمل مهامك</p>
            </div>
            <div className="h-2 w-32 bg-cream-200 rounded-full overflow-hidden">
              <div className="h-full bg-forest-600 rounded-full transition-all" style={{ width: `${taskProgressPercent(tasks)}%` }} />
            </div>
          </div>

          <select value={taskFilter} onChange={(e) => setTaskFilter(e.target.value as TaskStatus | 'all')} className="input w-auto text-sm">
            <option value="all">كل المهام ({tasks.length})</option>
            {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
            ))}
          </select>

          {filteredTasks.length === 0 ? (
            <EmptyState icon={<ClipboardList className="w-8 h-8" />} title="لا توجد مهام" subtitle="ستظهر هنا المهام التي يُسندها الشيخ" />
          ) : (
            <div className="space-y-3">
              {filteredTasks.map((task) => {
                const status = normalizeTaskStatus(task);
                const overdue = isTaskOverdue(task);
                return (
                  <div key={task.id} className={`card ${overdue ? 'border-red-200' : ''}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-bold text-forest-900">{task.title}</h3>
                          <Badge color={TASK_STATUS_COLORS[status]}>{TASK_STATUS_LABELS[status]}</Badge>
                          {overdue && <Badge color="red">متأخرة</Badge>}
                        </div>
                        {task.description && <p className="text-sm text-charcoal-600 mb-2">{task.description}</p>}
                        <div className="flex flex-wrap gap-3 text-xs text-charcoal-400">
                          {task.due_date && <span>موعد التسليم: {formatDateArabic(task.due_date)}</span>}
                          {task.category?.name && <span>• {task.category.name}</span>}
                        </div>
                        {task.submission_text && (
                          <div className="mt-3 p-3 rounded-xl bg-forest-50 text-sm">
                            <p className="text-xs text-forest-600 font-bold mb-1">تسليمك:</p>
                            <p className="text-charcoal-700">{task.submission_text}</p>
                            {task.submitted_at && <p className="text-xs text-charcoal-400 mt-1">{formatDateArabic(task.submitted_at)}</p>}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {status === 'assigned' && (
                          <button onClick={() => updateTaskStatus(task, 'in_progress')} className="btn btn-outline text-xs py-2">
                            <Play className="w-3.5 h-3.5" />
                            بدء العمل
                          </button>
                        )}
                        {status === 'in_progress' && (
                          <>
                            <button onClick={() => { setSubmitTask(task); setSubmissionText(''); }} className="btn btn-primary text-xs py-2">
                              <Send className="w-3.5 h-3.5" />
                              تسليم
                            </button>
                            <button onClick={() => updateTaskStatus(task, 'completed')} className="btn btn-outline text-xs py-2">
                              <CheckCircle className="w-3.5 h-3.5" />
                              إكمال
                            </button>
                          </>
                        )}
                        {status === 'submitted' && (
                          <span className="text-xs text-forest-600 bg-forest-50 px-3 py-2 rounded-xl">بانتظار مراجعة الشيخ</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* FINANCES TAB */}
      {portalTab === 'finances' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-forest-900">الذمم المالية</h2>
            <p className="text-sm text-charcoal-500">ملخص مستحقاتك وسجل المدفوعات</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="card bg-forest-900 text-cream-50">
              <p className="text-cream-300 text-sm">المبلغ المستحق</p>
              <p className="text-3xl font-bold text-gold-400">${finance.totalOwed.toFixed(2)}</p>
            </div>
            <div className="card">
              <p className="text-charcoal-500 text-sm">المُسدَّد</p>
              <p className="text-2xl font-bold text-green-700">${finance.totalPaidViaDues.toFixed(2)}</p>
            </div>
            <div className="card">
              <p className="text-charcoal-500 text-sm">إجمالي الفواتير</p>
              <p className="text-2xl font-bold text-forest-900">${finance.totalBilled.toFixed(2)}</p>
            </div>
          </div>

          <div className="card bg-gold-50 border border-gold-200">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-gold-700 shrink-0 mt-0.5" />
              <div className="text-sm text-gold-900">
                <p className="font-bold mb-1">تعليمات الدفع</p>
                <p>يتم تسوية الرسوم يدوياً مع الشيخ. لا يوجد دفع إلكتروني حالياً. تواصل مع الإدارة لترتيب التسديد.</p>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="font-bold text-forest-900 mb-3">المستحقات</h3>
              {dues.length === 0 ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <p>لا توجد رسوم مستحقة</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dues.map((d) => (
                    <div key={d.id} className="p-3 rounded-xl border border-cream-200">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-forest-900">{d.description}</p>
                        <Badge color={d.status === 'unpaid' ? 'red' : 'green'}>
                          {d.status === 'unpaid' ? 'غير مدفوع' : 'مدفوع'}
                        </Badge>
                      </div>
                      <p className="text-lg font-bold text-forest-800 mt-1">${Number(d.amount).toFixed(2)}</p>
                      <p className="text-xs text-charcoal-400">
                        {d.due_date ? `استحقاق: ${formatDateArabic(d.due_date)} • ` : ''}
                        {formatDateArabic(d.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-5 h-5 text-forest-700" />
                <h3 className="font-bold text-forest-900">سجل المدفوعات</h3>
              </div>
              {payments.length === 0 ? (
                <EmptyState icon={<History className="w-8 h-8" />} title="لا توجد مدفوعات مسجّلة" />
              ) : (
                <div className="space-y-2">
                  {payments.map((p) => (
                    <div key={p.id} className="p-3 rounded-xl bg-cream-50">
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-green-700">${Number(p.amount).toFixed(2)}</p>
                        <Badge color="green">{PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}</Badge>
                      </div>
                      {p.notes && <p className="text-sm text-charcoal-600 mt-1">{p.notes}</p>}
                      <p className="text-xs text-charcoal-400 mt-1">{formatDateArabic(p.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PROGRESS TAB */}
      {portalTab === 'progress' && (
        <div className="space-y-6">
          {enrolledCourses.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-forest-900 mb-3">دوراتي ونقاطي</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {enrolledCourses.map((c) => {
                  const pts = coursePoints[c.id] ?? basePoints;
                  const ptsColor = pts >= 90 ? 'bg-green-100 text-green-700' : pts >= 70 ? 'bg-gold-100 text-gold-700' : 'bg-red-100 text-red-700';
                  return (
                    <div key={c.id} className="card">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-bold text-forest-900 text-sm">{c.title}</p>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ptsColor}`}>{pts}/{basePoints}</span>
                      </div>
                      <div className="h-2 bg-cream-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pts >= 90 ? 'bg-green-500' : pts >= 70 ? 'bg-gold-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, (pts / basePoints) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-lg font-bold text-forest-900 mb-3">تقييمات هذا الأسبوع</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categoryStars.map(({ category, fills, pointsDeducted }) => {
                const activePoints = Math.max(0, category.max_points - pointsDeducted);
                return (
                  <div key={category.id} className="card">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-forest-900 text-sm">{category.name}</p>
                      <StarRating fills={fills} size={22} />
                    </div>
                    <p className="text-xs text-charcoal-400">{activePoints}/{category.max_points} نقطة</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <h3 className="font-bold text-forest-900 mb-3">تتبع الحفظ</h3>
            <div className="h-3 bg-cream-200 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-gradient-to-l from-forest-600 to-forest-800 rounded-full" style={{ width: `${profile?.quran_progress}%` }} />
            </div>
            <p className="text-sm text-charcoal-500">{profile?.quran_progress}% — {profile?.current_module || 'لم تحدد بعد'}</p>
          </div>

          {upcomingSessions.length > 0 && (
            <div className="card">
              <h3 className="font-bold text-forest-900 mb-3">الفعاليات القادمة</h3>
              <div className="space-y-2">
                {upcomingSessions.map((s) => (
                  <div key={s.id} className="p-3 rounded-xl border border-cream-200">
                    <p className="font-bold text-sm text-forest-900">{s.title}</p>
                    <p className="text-xs text-charcoal-500">{s.start_time ? `${formatDateArabic(s.start_time)} • ${formatTimeArabic(s.start_time)}` : 'غير مجدول'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h3 className="font-bold text-forest-900 mb-3">سجل الحضور</h3>
            {attendance.length === 0 ? (
              <EmptyState icon={<Clock className="w-8 h-8" />} title="لا يوجد سجل حضور" />
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {attendance.slice(0, 10).map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-cream-50">
                    <div>
                      <p className="text-sm font-medium">{a.session?.title || 'حصة'}</p>
                      <p className="text-xs text-charcoal-400">{formatDateArabic(a.timestamp)}</p>
                    </div>
                    <Badge color={a.status === 'present' ? 'green' : a.status === 'late' ? 'gold' : 'red'}>
                      {a.status === 'present' ? 'حاضر' : a.status === 'late' ? 'متأخر' : 'غائب'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {allEvaluations.length > 0 && (
            <div className="card">
              <h3 className="font-bold text-forest-900 mb-3">أرشيف التقييمات</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {allEvaluations.map((e) => (
                  <div key={e.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-cream-50">
                    <div className="flex items-center gap-2">
                      <StarRating fills={computeStarFills(e.points_deducted, e.category?.max_points || 25)} size={16} />
                      <span className="text-sm">{e.category?.name}</span>
                    </div>
                    <span className="text-xs text-charcoal-400">أسبوع {e.week_number}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Submit task modal */}
      {submitTask && (
        <Modal open onClose={() => setSubmitTask(null)} title={`تسليم: ${submitTask.title}`}>
          <div className="space-y-4">
            <textarea
              value={submissionText}
              onChange={(e) => setSubmissionText(e.target.value)}
              className="input min-h-[120px]"
              placeholder="اكتب ملخصاً لعملك أو أي ملاحظات..."
            />
            <button onClick={handleSubmitTask} disabled={!submissionText.trim()} className="btn btn-primary w-full">
              <Send className="w-4 h-4" />
              إرسال التسليم
            </button>
          </div>
        </Modal>
      )}

      {/* QR Scanner Modal */}
      <Modal open={scannerOpen} onClose={stopScanner} title="مسح رمز الحضور" size="sm">
        <div className="space-y-4">
          {!scanResult && <p className="text-sm text-charcoal-500 text-center">وجّه كاميرا هاتفك نحو رمز QR</p>}
          <div className="relative w-full rounded-xl overflow-hidden bg-forest-950">
            <div id="qr-reader" className="w-full" />
            {showSuccessOverlay && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-forest-950/80 backdrop-blur-sm z-10">
                <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mb-4">
                  <CheckCircle className="w-12 h-12 text-white" />
                </div>
                <p className="text-lg font-bold text-white">تم تسجيل الحضور بنجاح</p>
              </div>
            )}
          </div>
          {scanResult && !showSuccessOverlay && (
            <div className={`flex items-center gap-3 p-4 rounded-xl ${scanResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {scanResult.success ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <p className="text-sm font-medium">{scanResult.message}</p>
            </div>
          )}
          <button onClick={stopScanner} className="btn btn-outline w-full">
            <X className="w-4 h-4" />
            إغلاق
          </button>
        </div>
      </Modal>
    </DashboardLayout>
  );
}

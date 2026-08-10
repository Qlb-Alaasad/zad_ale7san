import { useEffect, useState, useRef, useCallback } from 'react';
import { Star, BookOpen, DollarSign, ClipboardList, Calendar, QrCode, X, Award, TrendingUp, Clock, MapPin, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Camera, StickyNote } from 'lucide-react';
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
import type { Category, Evaluation, Session, FinancialDue, Task, Attendance, StudentNote, Course, AppSettings } from '@/lib/types';

export default function StudentPortal() {
  const { profile, session } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [allEvaluations, setAllEvaluations] = useState<Evaluation[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [dues, setDues] = useState<FinancialDue[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
  const [coursePoints, setCoursePoints] = useState<Record<string, number>>({});
  const [basePoints, setBasePoints] = useState(100);
  const [loading, setLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningPaused = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { weekNumber, year } = getCurrentWeekYear();

  const load = useCallback(async () => {
    if (!profile) return;
    const [cats, evals, allEvals, sess, duesData, tasksData, attData, notesData, courseData, enrollData, catEnrollData, settingsData] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('evaluations').select('*, category:category(*)').eq('student_id', profile.id).eq('week_number', weekNumber).eq('year', year),
      supabase.from('evaluations').select('*, category:category(*)').eq('student_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('sessions').select('*').gte('end_time', new Date().toISOString()).order('start_time'),
      supabase.from('financial_dues').select('*').eq('student_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').eq('student_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('attendance').select('*, session:session(*)').eq('student_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('student_notes').select('*').eq('student_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('courses').select('*').order('title'),
      supabase.from('student_courses').select('course_id').eq('student_id', profile.id),
      supabase.from('student_categories').select('category_id').eq('student_id', profile.id),
      supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    const enrolledCatIds = new Set((catEnrollData.data || []).map((e: any) => e.category_id));
    const allCategories = (cats.data as Category[]) || [];
    setCategories(allCategories.filter((c) => enrolledCatIds.has(c.id)));
    setEvaluations((evals.data as Evaluation[] || []).filter((e) => !e.category_id || enrolledCatIds.has(e.category_id)));
    const filteredAllEvals = (allEvals.data as Evaluation[] || []).filter((e) => !e.category_id || enrolledCatIds.has(e.category_id));
    setAllEvaluations(filteredAllEvals);
    setSessions((sess.data as Session[] || []).filter((s) => !s.category_id || enrolledCatIds.has(s.category_id)));
    setDues((duesData.data as FinancialDue[] || []).filter((d) => !d.category_id || enrolledCatIds.has(d.category_id)));
    setTasks((tasksData.data as Task[] || []).filter((t) => !t.category_id || enrolledCatIds.has(t.category_id)));
    setAttendance(attData.data as Attendance[] || []);
    setNotes(notesData.data as StudentNote[] || []);
    const allCourses = courseData.data as Course[] || [];
    setCourses(allCourses);
    const enrolledIds = (enrollData.data || []).map((e: any) => e.course_id);
    const enrolled = allCourses.filter((c) => enrolledIds.includes(c.id));
    setEnrolledCourses(enrolled);
    if (settingsData) setBasePoints((settingsData as AppSettings).base_points);
    // Compute per-course points
    const evalsAll = filteredAllEvals;
    const notesAll = (notesData.data as StudentNote[]) || [];
    const pointsMap: Record<string, number> = {};
    const bp = settingsData ? (settingsData as AppSettings).base_points : 100;
    for (const c of enrolled) {
      pointsMap[c.id] = computeCoursePoints(c.id, bp, evalsAll, notesAll);
    }
    setCoursePoints(pointsMap);
    setLoading(false);
  }, [profile, weekNumber, year]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('student-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'evaluations', filter: `student_id=eq.${profile.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_dues', filter: `student_id=eq.${profile.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `student_id=eq.${profile.id}` }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sessions' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `student_id=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, load]);

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
          async (decodedText) => {
            await handleScan(decodedText);
          },
          () => {}
        );
      } catch (err) {
        setScanResult({ success: false, message: 'تعذر الوصول إلى الكاميرا. تأكد من السماح بالوصول.' });
      }
    }, 300);
  };

  const stopScanner = async () => {
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    isScanningPaused.current = false;
    setShowSuccessOverlay(false);
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
    setScannerOpen(false);
  };

  const handleScan = async (payload: string) => {
    if (!profile) return;
    if (isScanningPaused.current) return;
    isScanningPaused.current = true;
    try {
      const parsed = JSON.parse(payload);
      const sid = parsed.s as string;
      const verifyResult = await verifyQrPayload(payload, sessionSecret(sid));
      if (!verifyResult.valid || !verifyResult.sessionId) {
        setScanResult({ success: false, message: 'رمز غير صالح أو منتهي الصلاحية' });
        isScanningPaused.current = false;
        return;
      }
      const sessionId = verifyResult.sessionId;
      // Check if already attended
      const { data: existing } = await supabase.from('attendance').select('*').eq('student_id', profile.id).eq('session_id', sessionId).maybeSingle();
      if (existing) {
        setScanResult({ success: false, message: 'تم تسجيل حضورك مسبقاً لهذه الحصة' });
        isScanningPaused.current = false;
        return;
      }
      // Check if late (after start time + 15 min)
      const { data: session } = await supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle();
      if (!session) {
        setScanResult({ success: false, message: 'الحصة غير موجودة' });
        isScanningPaused.current = false;
        return;
      }
      const now = new Date();
      const start = session.start_time ? new Date(session.start_time) : now;
      if (!session.is_active) {
        setScanResult({ success: false, message: 'الحصة غير نشطة حالياً. اطلب من الشيخ تفعيلها.' });
        isScanningPaused.current = false;
        return;
      }
      const lateThreshold = new Date(start.getTime() + 15 * 60000);
      const status = now > lateThreshold ? 'late' : 'present';
      const pointsDeducted = status === 'late' ? 0 : 0;
      await supabase.from('attendance').insert({
        student_id: profile.id,
        session_id: sessionId,
        status,
        points_deducted: pointsDeducted,
      });
      const successMessage = status === 'late' ? 'تم تسجيل حضورك (متأخر)' : 'تم تسجيل الحضور بنجاح';
      setScanResult({ success: true, message: successMessage });
      setShowSuccessOverlay(true);
      load();
      cooldownTimerRef.current = setTimeout(() => {
        setShowSuccessOverlay(false);
        setScanResult(null);
        isScanningPaused.current = false;
        cooldownTimerRef.current = null;
      }, 5000);
    } catch {
      setScanResult({ success: false, message: 'رمز غير صالح' });
      isScanningPaused.current = false;
    }
  };

  if (loading) return <DashboardLayout navItems={[{ path: '/portal', label: 'البوابة', icon: <BookOpen className="w-5 h-5" /> }]}><Loading /></DashboardLayout>;

  const categoryStars = getCategoryStars(categories, evaluations);
  const totalUnpaid = dues.filter((d) => d.status === 'unpaid').reduce((s, d) => s + Number(d.amount), 0);
  const upcomingSessions = sessions.filter((s) => s.session_type === 'match' || s.session_type === 'event').slice(0, 5);
  const recentAttendance = attendance.slice(0, 5);
  const supervisorNotes = notes.filter((n) => n.note_type === 'supervisor' || n.note_type === 'absence' || n.note_type === 'excuse' || n.note_type === 'custom').slice(0, 10);

  const noteTypeLabels: Record<string, { label: string; color: string }> = {
    supervisor: { label: 'ملاحظة مشرف', color: 'bg-blue-100 text-blue-700' },
    absence: { label: 'غياب تلقائي', color: 'bg-red-100 text-red-700' },
    general: { label: 'عامة', color: 'bg-cream-100 text-charcoal-600' },
    excuse: { label: 'غياب بعذر', color: 'bg-gold-100 text-gold-700' },
    custom: { label: 'مخصصة', color: 'bg-forest-100 text-forest-700' },
  };

  return (
    <DashboardLayout navItems={[{ path: '/portal', label: 'البوابة', icon: <BookOpen className="w-5 h-5" /> }]}>
      {/* Welcome header */}
      <div className="mb-6 bg-forest-900 rounded-2xl p-6 text-cream-50 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-48 h-48 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold mb-1">مرحباً، {profile?.full_name}</h1>
          <p className="text-cream-300 text-sm">إليك ملخص أدائك لهذا الأسبوع</p>
        </div>
      </div>

      {/* QR Scanner button */}
      <button onClick={startScanner} className="btn btn-gold w-full mb-6 text-base py-3.5 animate-pulse-gold">
        <QrCode className="w-5 h-5" />
        مسح رمز الحضور
      </button>

      {/* My Courses with Points */}
      {enrolledCourses.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-5 h-5 text-forest-700" />
            <h2 className="text-lg font-bold text-forest-900">دوراتي ونقاطي</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {enrolledCourses.map((c) => {
              const pts = coursePoints[c.id];
              const hasPts = pts !== undefined;
              const ptsColor = !hasPts ? '' : pts >= 90 ? 'bg-green-100 text-green-700' : pts >= 70 ? 'bg-gold-100 text-gold-700' : 'bg-red-100 text-red-700';
              return (
                <div key={c.id} className="card">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-bold text-forest-900 text-sm">{c.title}</p>
                    {hasPts && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ptsColor}`}>
                        {pts}/{basePoints} نقطة
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-charcoal-400">{c.schedule_days?.join(' • ') || c.schedule}</p>
                  {hasPts && (
                    <div className="mt-2 h-2 bg-cream-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${pts >= 90 ? 'bg-green-500' : pts >= 70 ? 'bg-gold-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, (pts / basePoints) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Star ratings */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-5 h-5 text-gold-500" />
          <h2 className="text-lg font-bold text-forest-900">تقييمات هذا الأسبوع</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {categoryStars.map(({ category, fills }) => (
            <div key={category.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-forest-900 text-sm">{category.name}</p>
                <StarRating fills={fills} size={22} />
              </div>
              <p className="text-xs text-charcoal-400">{category.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Quran progress */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-forest-700" />
            <h3 className="font-bold text-forest-900">تتبع الحفظ</h3>
          </div>
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-charcoal-500">التقدم الإجمالي</span>
              <span className="font-bold text-forest-900">{profile?.quran_progress}%</span>
            </div>
            <div className="h-3 bg-cream-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-l from-forest-600 to-forest-800 rounded-full transition-all duration-500" style={{ width: `${profile?.quran_progress}%` }} />
            </div>
          </div>
          <p className="text-sm text-charcoal-500">
            <span className="font-medium">الوحدة الحالية:</span> {profile?.current_module || 'لم تحدد بعد'}
          </p>
        </div>

        {/* Financial */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-forest-700" />
            <h3 className="font-bold text-forest-900">الرسوم المستحقة</h3>
          </div>
          {totalUnpaid > 0 ? (
            <div>
              <p className="text-3xl font-bold text-red-600 mb-1">${totalUnpaid}</p>
              <p className="text-sm text-charcoal-500">إجمالي المبلغ المستحق</p>
              <div className="mt-3 bg-cream-50 rounded-xl p-3 text-sm text-charcoal-500">
                <AlertCircle className="w-4 h-4 inline-block ml-1 text-gold-600" />
                تتم التسوية يدوياً مع الشيخ. لا يوجد دفع إلكتروني.
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <p className="font-medium">لا توجد رسوم مستحقة</p>
            </div>
          )}
        </div>

        {/* Tasks */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="w-5 h-5 text-forest-700" />
            <h3 className="font-bold text-forest-900">المهام</h3>
          </div>
          {tasks.length === 0 ? (
            <EmptyState icon={<ClipboardList className="w-8 h-8" />} title="لا توجد مهام" />
          ) : (
            <div className="space-y-2">
              {tasks.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-cream-50">
                  <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 ${t.completed ? 'bg-forest-600 border-forest-600' : 'border-cream-300'}`}>
                    {t.completed && <CheckCircle className="w-3 h-3 text-cream-50" />}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${t.completed ? 'text-charcoal-400 line-through' : 'text-forest-900'}`}>{t.title}</p>
                    {t.due_date && <p className="text-xs text-charcoal-400">موعد التسليم: {formatDateArabic(t.due_date)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming matches/events */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-forest-700" />
            <h3 className="font-bold text-forest-900">المباريات والفعاليات القادمة</h3>
          </div>
          {upcomingSessions.length === 0 ? (
            <EmptyState icon={<Calendar className="w-8 h-8" />} title="لا توجد فعاليات قادمة" />
          ) : (
            <div className="space-y-2">
              {upcomingSessions.map((s) => (
                <div key={s.id} className="p-3 rounded-xl border border-cream-200">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-forest-900 text-sm">{s.title}</p>
                    <Badge color={s.session_type === 'match' ? 'gold' : 'green'}>
                      {s.session_type === 'match' ? 'مباراة' : 'فعالية'}
                    </Badge>
                  </div>
                  <p className="text-xs text-charcoal-500">{s.start_time ? `${formatDateArabic(s.start_time)} • ${formatTimeArabic(s.start_time)}` : 'غير مجدول'}</p>
                  {s.location && <p className="text-xs text-charcoal-400 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" />{s.location}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Supervisor & absence notes */}
        {supervisorNotes.length > 0 && (
          <div className="card lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <StickyNote className="w-5 h-5 text-forest-700" />
              <h3 className="font-bold text-forest-900">الملاحظات والتنبيهات</h3>
            </div>
            <div className="space-y-2">
              {supervisorNotes.map((n) => (
                <div key={n.id} className={`flex items-start gap-2 p-3 rounded-xl ${n.note_type === 'absence' ? 'bg-red-50' : n.note_type === 'excuse' ? 'bg-gold-50' : 'bg-cream-50'}`}>
                  {n.note_type === 'absence' ? <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" /> : n.note_type === 'excuse' ? <CheckCircle className="w-4 h-4 text-gold-600 mt-0.5 shrink-0" /> : <StickyNote className="w-4 h-4 text-forest-600 mt-0.5 shrink-0" />}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${noteTypeLabels[n.note_type]?.color || noteTypeLabels.general.color}`}>
                        {noteTypeLabels[n.note_type]?.label || 'عامة'}
                      </span>
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
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent attendance */}
        <div className="card lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-forest-700" />
            <h3 className="font-bold text-forest-900">سجل الحضور الأخير</h3>
          </div>
          {recentAttendance.length === 0 ? (
            <EmptyState icon={<Clock className="w-8 h-8" />} title="لا يوجد سجل حضور" />
          ) : (
            <div className="space-y-2">
              {recentAttendance.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-cream-50">
                  <div>
                    <p className="text-sm font-medium text-forest-900">{a.session?.title || 'حصة'}</p>
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

        {/* Historical evaluations */}
        <div className="card lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-forest-700" />
            <h3 className="font-bold text-forest-900">الأرشيف التاريخي للتقييمات</h3>
          </div>
          {allEvaluations.length === 0 ? (
            <EmptyState icon={<TrendingUp className="w-8 h-8" />} title="لا توجد تقييمات سابقة" />
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {allEvaluations.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-cream-50">
                  <div className="flex items-center gap-3">
                    <StarRating fills={computeStarFills(e.points_deducted, e.category?.max_points || 25)} size={16} />
                    <div>
                      <p className="text-sm font-medium text-forest-900">{e.category?.name}</p>
                      {e.note && <p className="text-xs text-charcoal-400">{e.note}</p>}
                    </div>
                  </div>
                  <span className="text-xs text-charcoal-400">أسبوع {e.week_number} - {e.year}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Scanner Modal */}
      <Modal open={scannerOpen} onClose={stopScanner} title="مسح رمز الحضور" size="sm">
        <div className="space-y-4">
          {!scanResult && (
            <p className="text-sm text-charcoal-500 text-center">وجّه كاميرا هاتفك نحو رمز QR المعروض على شاشة الشيخ</p>
          )}
          <div className="relative w-full rounded-xl overflow-hidden bg-forest-950">
            <div id="qr-reader" className="w-full" />
            {showSuccessOverlay && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-forest-950/80 backdrop-blur-sm animate-overlay-in z-10">
                <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mb-4 animate-check-pop shadow-lg shadow-green-500/50">
                  <CheckCircle className="w-12 h-12 text-white" />
                </div>
                <p className="text-lg font-bold text-white text-center px-4">تم تسجيل الحضور بنجاح</p>
                <p className="text-sm text-green-300 mt-1">يمكنك مسح رمز آخر بعد قليل</p>
                <div className="mt-4 w-32 h-1 bg-forest-800 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full animate-[shrink_5s_linear_forwards]" style={{ animation: 'shrinkBar 5s linear forwards' }} />
                </div>
              </div>
            )}
          </div>
          {scanResult && !showSuccessOverlay && (
            <div className={`flex items-center gap-3 p-4 rounded-xl animate-fade-in ${scanResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
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

import { useEffect, useState, useRef, useCallback } from 'react';
import { Star, BookOpen, DollarSign, ClipboardList, Calendar, QrCode, X, Award, TrendingUp, Clock, MapPin, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Camera, StickyNote } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Modal } from '@/components/Modal';
import { Loading, EmptyState, Badge } from '@/components/ui';
import { StarRating } from '@/components/StarRating';
import { computeStarFills, getCategoryStars, getCurrentWeekYear } from '@/lib/scoring';
import { verifyQrPayload, sessionSecret } from '@/lib/qr';
import { formatDateArabic, formatTimeArabic } from '@/lib/date';
import type { Category, Evaluation, Session, FinancialDue, Task, Attendance, StudentNote } from '@/lib/types';

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
  const [loading, setLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const { weekNumber, year } = getCurrentWeekYear();

  const load = useCallback(async () => {
    if (!profile) return;
    const [cats, evals, allEvals, sess, duesData, tasksData, attData, notesData] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('evaluations').select('*, category:category(*)').eq('student_id', profile.id).eq('week_number', weekNumber).eq('year', year),
      supabase.from('evaluations').select('*, category:category(*)').eq('student_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('sessions').select('*').gte('end_time', new Date().toISOString()).order('start_time'),
      supabase.from('financial_dues').select('*').eq('student_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').eq('student_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('attendance').select('*, session:session(*)').eq('student_id', profile.id).order('created_at', { ascending: false }),
      supabase.from('student_notes').select('*').eq('student_id', profile.id).order('created_at', { ascending: false }),
    ]);
    setCategories(cats.data as Category[] || []);
    setEvaluations(evals.data as Evaluation[] || []);
    setAllEvaluations(allEvals.data as Evaluation[] || []);
    setSessions(sess.data as Session[] || []);
    setDues(duesData.data as FinancialDue[] || []);
    setTasks(tasksData.data as Task[] || []);
    setAttendance(attData.data as Attendance[] || []);
    setNotes(notesData.data as StudentNote[] || []);
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
    try {
      const parsed = JSON.parse(payload);
      const sid = parsed.s as string;
      const verifyResult = await verifyQrPayload(payload, sessionSecret(sid));
      if (!verifyResult.valid || !verifyResult.sessionId) {
        setScanResult({ success: false, message: 'رمز غير صالح أو منتهي الصلاحية' });
        return;
      }
      const sessionId = verifyResult.sessionId;
      // Check if already attended
      const { data: existing } = await supabase.from('attendance').select('*').eq('student_id', profile.id).eq('session_id', sessionId).maybeSingle();
      if (existing) {
        setScanResult({ success: false, message: 'تم تسجيل حضورك مسبقاً لهذه الحصة' });
        await stopScanner();
        return;
      }
      // Check if late (after start time + 15 min)
      const { data: session } = await supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle();
      if (!session) {
        setScanResult({ success: false, message: 'الحصة غير موجودة' });
        return;
      }
      const now = new Date();
      const start = new Date(session.start_time);
      if (!session.is_active) {
        setScanResult({ success: false, message: 'الحصة غير نشطة حالياً. اطلب من الشيخ تفعيلها.' });
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
      setScanResult({ success: true, message: status === 'late' ? 'تم تسجيل حضورك (متأخر)' : 'تم تسجيل حضورك بنجاح' });
      await stopScanner();
      load();
    } catch {
      setScanResult({ success: false, message: 'رمز غير صالح' });
    }
  };

  if (loading) return <DashboardLayout navItems={[{ path: '/portal', label: 'البوابة', icon: <BookOpen className="w-5 h-5" /> }]}><Loading /></DashboardLayout>;

  const categoryStars = getCategoryStars(categories, evaluations);
  const totalUnpaid = dues.filter((d) => d.status === 'unpaid').reduce((s, d) => s + Number(d.amount), 0);
  const upcomingSessions = sessions.filter((s) => s.session_type === 'match' || s.session_type === 'event').slice(0, 5);
  const recentAttendance = attendance.slice(0, 5);
  const supervisorNotes = notes.filter((n) => n.note_type === 'supervisor' || n.note_type === 'absence').slice(0, 10);

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
                  <p className="text-xs text-charcoal-500">{formatDateArabic(s.start_time)} • {formatTimeArabic(s.start_time)}</p>
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
                <div key={n.id} className={`flex items-start gap-2 p-3 rounded-xl ${n.note_type === 'absence' ? 'bg-red-50' : 'bg-cream-50'}`}>
                  {n.note_type === 'absence' ? <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" /> : <StickyNote className="w-4 h-4 text-forest-600 mt-0.5 shrink-0" />}
                  <div>
                    <p className="text-sm text-charcoal-700">{n.note}</p>
                    <p className="text-xs text-charcoal-400 mt-0.5">{formatDateArabic(n.created_at)}</p>
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
          {scanResult ? (
            <div className={`flex items-center gap-3 p-4 rounded-xl ${scanResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {scanResult.success ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <p className="text-sm font-medium">{scanResult.message}</p>
            </div>
          ) : (
            <p className="text-sm text-charcoal-500 text-center">وجّه كاميرا هاتفك نحو رمز QR المعروض على شاشة الشيخ</p>
          )}
          <div id="qr-reader" className="w-full rounded-xl overflow-hidden bg-forest-950" />
          <button onClick={stopScanner} className="btn btn-outline w-full">
            <X className="w-4 h-4" />
            إغلاق
          </button>
        </div>
      </Modal>
    </DashboardLayout>
  );
}

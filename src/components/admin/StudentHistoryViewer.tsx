import { useCallback, useEffect, useState } from 'react';
import { History, Calendar, Star, Clock, BookOpen } from 'lucide-react';
import { fetchStudentHistory } from '@/lib/evaluation-history';
import { getAcademyWeekYear } from '@/lib/academy-week';
import { formatDateArabic } from '@/lib/date';
import { computeStarFills } from '@/lib/scoring';
import { StarRating } from '@/components/StarRating';
import { Loading, EmptyState, Badge } from '@/components/ui';
import type { EvaluationHistoryRecord } from '@/lib/types';

interface StudentHistoryViewerProps {
  studentId: string;
  studentName: string;
}

export function StudentHistoryViewer({ studentId, studentName }: StudentHistoryViewerProps) {
  const [records, setRecords] = useState<EvaluationHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<EvaluationHistoryRecord | null>(null);
  const current = getAcademyWeekYear();

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchStudentHistory(studentId);
    setRecords(data);
    setSelected(data[0] ?? null);
    setLoading(false);
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading label="جارٍ تحميل السجل..." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="w-5 h-5 text-forest-700" />
        <h4 className="font-bold text-forest-900">السجل التاريخي — {studentName}</h4>
      </div>
      <p className="text-xs text-charcoal-500">
        الأرشيف يُحدَّث تلقائياً كل جمعة 00:00. الأسبوع الحالي: {current.weekStart} → {current.weekEnd}
      </p>

      {records.length === 0 ? (
        <EmptyState icon={<History className="w-8 h-8" />} title="لا يوجد سجل أرشيف بعد" subtitle="سيُحفظ أول أرشيف بعد أول جمعة" />
      ) : (
        <>
          <select
            value={selected ? `${selected.year}-${selected.week_number}` : ''}
            onChange={(e) => {
              const [y, w] = e.target.value.split('-').map(Number);
              setSelected(records.find((r) => r.year === y && r.week_number === w) ?? null);
            }}
            className="input text-sm"
          >
            {records.map((r) => (
              <option key={r.id} value={`${r.year}-${r.week_number}`}>
                أسبوع {r.week_number} / {r.year} ({formatDateArabic(r.week_start)} — {formatDateArabic(r.week_end)})
              </option>
            ))}
          </select>

          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-cream-50 rounded-xl p-3">
                  <p className="text-charcoal-400">تقدم الحفظ (لحظة الأرشيف)</p>
                  <p className="font-bold text-forest-900">{selected.quran_progress ?? 0}%</p>
                </div>
                <div className="bg-cream-50 rounded-xl p-3">
                  <p className="text-charcoal-400">الوحدة</p>
                  <p className="font-bold text-forest-900">{selected.current_module || '—'}</p>
                </div>
              </div>

              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-4 h-4 text-gold-500" />
                  <p className="font-bold text-sm">التقييمات ({selected.evaluations?.length || 0})</p>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {(selected.evaluations || []).map((e, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-cream-50 text-sm">
                      <div className="flex items-center gap-2">
                        <StarRating fills={computeStarFills(e.points_deducted, 25)} size={14} />
                        <span>{e.note || '—'}</span>
                      </div>
                      <span className="text-xs text-charcoal-400">-{e.points_deducted} نقطة</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4 text-forest-700" />
                  <p className="font-bold text-sm">الملاحظات ({selected.notes?.length || 0})</p>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
                  {(selected.notes || []).map((n, i) => (
                    <p key={i} className="p-2 rounded bg-cream-50">{n.note}</p>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-forest-700" />
                  <p className="font-bold text-sm">الحضور ({selected.attendance?.length || 0})</p>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {(selected.attendance || []).map((a, i) => (
                    <div key={i} className="flex justify-between text-sm p-2 rounded bg-cream-50">
                      <span>{formatDateArabic(a.timestamp)}</span>
                      <Badge color={a.status === 'present' ? 'green' : a.status === 'late' ? 'gold' : 'red'}>
                        {a.status === 'present' ? 'حاضر' : a.status === 'late' ? 'متأخر' : 'غائب'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-charcoal-400 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                أُرشف في {formatDateArabic(selected.archived_at)}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

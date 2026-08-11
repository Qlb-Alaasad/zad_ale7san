import { useCallback, useEffect, useState } from 'react';
import { DollarSign, Plus, Trash2, Save, X, History, CreditCard } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';
import { formatDateArabic } from '@/lib/date';
import { financeSummary, PAYMENT_METHOD_LABELS } from '@/lib/finances';
import { Loading, EmptyState, Badge } from '@/components/ui';
import { Modal } from '@/components/Modal';
import type { Profile, Category, FinancialDue, FinancialPayment } from '@/lib/types';

export function FinancialTabPanel() {
  const { profile: adminProfile } = useAuth();
  const [students, setStudents] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dues, setDues] = useState<FinancialDue[]>([]);
  const [payments, setPayments] = useState<FinancialPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [showAddDue, setShowAddDue] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCatId, setNewCatId] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payNotes, setPayNotes] = useState('');
  const [payDueId, setPayDueId] = useState('');

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

  const loadStudentFinance = useCallback(async (studentId: string) => {
    const [{ data: dueData }, { data: payData }] = await Promise.all([
      supabase.from('financial_dues').select('*, category:categories(id, name)').eq('student_id', studentId).order('created_at', { ascending: false }),
      supabase.from('financial_payments').select('*').eq('student_id', studentId).order('created_at', { ascending: false }),
    ]);
    setDues(dueData as FinancialDue[] || []);
    setPayments(payData as FinancialPayment[] || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (selected) loadStudentFinance(selected.id);
  }, [selected, loadStudentFinance]);

  const markPaid = async (due: FinancialDue) => {
    if (!selected) return;
    await supabase.from('financial_dues').update({ status: 'paid' }).eq('id', due.id);
    await supabase.from('financial_payments').insert({
      student_id: selected.id,
      due_id: due.id,
      amount: due.amount,
      payment_method: 'cash',
      notes: `تسديد: ${due.description}`,
      recorded_by: adminProfile?.id || null,
    });
    await createNotification(selected.id, 'تحديث مالي', `تم تسديد "${due.description}" بمبلغ $${due.amount}`, 'financial');
    loadStudentFinance(selected.id);
  };

  const markUnpaid = async (due: FinancialDue) => {
    if (!selected) return;
    await supabase.from('financial_dues').update({ status: 'unpaid' }).eq('id', due.id);
    loadStudentFinance(selected.id);
  };

  const addDue = async () => {
    if (!selected || !newDesc || !newAmount) return;
    await supabase.from('financial_dues').insert({
      student_id: selected.id,
      category_id: newCatId || null,
      description: newDesc,
      amount: parseFloat(newAmount),
      due_date: newDueDate || null,
      notes: newNotes,
    });
    await createNotification(selected.id, 'رسوم جديدة', `${newDesc}: $${newAmount}`, 'financial');
    setNewDesc('');
    setNewAmount('');
    setNewCatId('');
    setNewDueDate('');
    setNewNotes('');
    setShowAddDue(false);
    loadStudentFinance(selected.id);
  };

  const recordPayment = async () => {
    if (!selected || !payAmount) return;
    await supabase.from('financial_payments').insert({
      student_id: selected.id,
      due_id: payDueId || null,
      amount: parseFloat(payAmount),
      payment_method: payMethod,
      notes: payNotes,
      recorded_by: adminProfile?.id || null,
    });
    if (payDueId) {
      await supabase.from('financial_dues').update({ status: 'paid' }).eq('id', payDueId);
    }
    await createNotification(selected.id, 'تسجيل دفعة', `تم تسجيل دفعة بمبلغ $${payAmount}`, 'financial');
    setPayAmount('');
    setPayMethod('cash');
    setPayNotes('');
    setPayDueId('');
    setShowAddPayment(false);
    loadStudentFinance(selected.id);
  };

  const deleteDue = async (id: string) => {
    if (!selected || !confirm('حذف هذه الرسوم؟')) return;
    await supabase.from('financial_dues').delete().eq('id', id);
    loadStudentFinance(selected.id);
  };

  if (loading) return <Loading />;

  if (!selected) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-forest-900">الذمم المالية</h3>
          <p className="text-sm text-charcoal-500">إدارة المستحقات وسجل المدفوعات لكل طالب</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {students.map((s) => (
            <button key={s.id} onClick={() => setSelected(s)} className="card text-right hover:shadow-lg transition-shadow">
              <p className="font-bold text-forest-900">{s.full_name}</p>
              <p className="text-xs text-charcoal-400 mt-1">عرض المستحقات والسجل</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const summary = financeSummary(dues, payments);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="btn btn-outline text-sm">
            <X className="w-4 h-4" />
            رجوع
          </button>
          <div>
            <h3 className="text-lg font-bold text-forest-900">{selected.full_name}</h3>
            <p className="text-sm text-charcoal-500">الذمم المالية وسجل المدفوعات</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddPayment(true)} className="btn btn-outline text-sm">
            <CreditCard className="w-4 h-4" />
            تسجيل دفعة
          </button>
          <button onClick={() => setShowAddDue(true)} className="btn btn-gold text-sm">
            <Plus className="w-4 h-4" />
            إضافة رسوم
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="card bg-forest-900 text-cream-50">
          <p className="text-cream-300 text-sm">المستحقات غير المدفوعة</p>
          <p className="text-3xl font-bold text-gold-400">${summary.totalOwed.toFixed(2)}</p>
        </div>
        <div className="card">
          <p className="text-charcoal-500 text-sm">إجمالي المُسدَّد (رسوم)</p>
          <p className="text-2xl font-bold text-green-700">${summary.totalPaidViaDues.toFixed(2)}</p>
        </div>
        <div className="card">
          <p className="text-charcoal-500 text-sm">سجل المدفوعات</p>
          <p className="text-2xl font-bold text-forest-900">${summary.totalRecorded.toFixed(2)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-forest-700" />
            <h4 className="font-bold text-forest-900">المستحقات</h4>
          </div>
          {dues.length === 0 ? (
            <EmptyState icon={<DollarSign className="w-8 h-8" />} title="لا توجد رسوم" />
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {dues.map((d) => (
                <div key={d.id} className="p-3 rounded-xl border border-cream-200">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-forest-900">{d.description}</p>
                      <p className="text-sm text-charcoal-500">${Number(d.amount).toFixed(2)}</p>
                      <p className="text-xs text-charcoal-400 mt-1">
                        {d.due_date ? `استحقاق: ${formatDateArabic(d.due_date)} • ` : ''}
                        {formatDateArabic(d.created_at)}
                      </p>
                      {d.notes && <p className="text-xs text-charcoal-500 mt-1">{d.notes}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge color={d.status === 'unpaid' ? 'red' : 'green'}>
                        {d.status === 'unpaid' ? 'غير مدفوع' : 'مدفوع'}
                      </Badge>
                      {d.status === 'unpaid' ? (
                        <button onClick={() => markPaid(d)} className="text-xs text-green-700 hover:underline">تسديد</button>
                      ) : (
                        <button onClick={() => markUnpaid(d)} className="text-xs text-charcoal-400 hover:underline">إلغاء التسديد</button>
                      )}
                      <button onClick={() => deleteDue(d.id)} className="p-1 rounded hover:bg-red-50 text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-forest-700" />
            <h4 className="font-bold text-forest-900">سجل المدفوعات</h4>
          </div>
          {payments.length === 0 ? (
            <EmptyState icon={<History className="w-8 h-8" />} title="لا توجد مدفوعات مسجّلة" />
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {payments.map((p) => (
                <div key={p.id} className="p-3 rounded-xl bg-cream-50">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-forest-900">${Number(p.amount).toFixed(2)}</p>
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

      {showAddDue && (
        <Modal open onClose={() => setShowAddDue(false)} title="إضافة رسوم جديدة">
          <div className="space-y-4">
            <div>
              <label className="label">الوصف</label>
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="input" placeholder="مثال: رسوم شهرية" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">المبلغ ($)</label>
                <input type="number" step="0.01" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">تاريخ الاستحقاق</label>
                <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} className="input" />
              </div>
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
            <div>
              <label className="label">ملاحظات</label>
              <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} className="input min-h-[60px]" />
            </div>
            <button onClick={addDue} disabled={!newDesc || !newAmount} className="btn btn-primary w-full">
              <Save className="w-4 h-4" />
              حفظ
            </button>
          </div>
        </Modal>
      )}

      {showAddPayment && (
        <Modal open onClose={() => setShowAddPayment(false)} title="تسجيل دفعة">
          <div className="space-y-4">
            <div>
              <label className="label">المبلغ ($)</label>
              <input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">طريقة الدفع</label>
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="input">
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">ربط برسوم (اختياري)</label>
              <select value={payDueId} onChange={(e) => setPayDueId(e.target.value)} className="input">
                <option value="">— دفعة عامة —</option>
                {dues.filter((d) => d.status === 'unpaid').map((d) => (
                  <option key={d.id} value={d.id}>{d.description} (${d.amount})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">ملاحظات</label>
              <textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} className="input min-h-[60px]" />
            </div>
            <button onClick={recordPayment} disabled={!payAmount} className="btn btn-primary w-full">
              <Save className="w-4 h-4" />
              تسجيل الدفعة
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

import { supabase } from './supabase';
import type { FinancialDue, FinancialPayment } from './types';

/** Fetch financial dues for a student (student_id = profiles.id / auth.users.id). */
export async function getFinancialDuesForStudent(studentId: string): Promise<FinancialDue[]> {
  if (!studentId) return [];

  const { data, error } = await supabase
    .from('financial_dues')
    .select('*, category:categories(id, name)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[finances] getFinancialDuesForStudent failed:', error.message);
    return [];
  }

  return (data as FinancialDue[]) || [];
}

/** Fetch payment ledger entries for a student. */
export async function getFinancialPaymentsForStudent(studentId: string): Promise<FinancialPayment[]> {
  if (!studentId) return [];

  const { data, error } = await supabase
    .from('financial_payments')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[finances] getFinancialPaymentsForStudent failed:', error.message);
    return [];
  }

  return (data as FinancialPayment[]) || [];
}

/** Sum unpaid (pending) dues — status 'unpaid' is the pending/outstanding state in this schema. */
export function sumUnpaidDues(dues: FinancialDue[]): number {
  return dues
    .filter((d) => d.status === 'unpaid')
    .reduce((s, d) => s + Number(d.amount), 0);
}

export function sumPaidDues(dues: FinancialDue[]): number {
  return dues
    .filter((d) => d.status === 'paid')
    .reduce((s, d) => s + Number(d.amount), 0);
}

export function sumPayments(payments: FinancialPayment[]): number {
  return payments.reduce((s, p) => s + Number(p.amount), 0);
}

export function financeSummary(dues: FinancialDue[], payments: FinancialPayment[]) {
  const totalOwed = sumUnpaidDues(dues);
  const totalPaidViaDues = sumPaidDues(dues);
  const totalRecorded = sumPayments(payments);
  return {
    totalOwed,
    totalPaidViaDues,
    totalRecorded,
    totalBilled: totalOwed + totalPaidViaDues,
  };
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'نقداً',
  transfer: 'تحويل بنكي',
  other: 'أخرى',
};

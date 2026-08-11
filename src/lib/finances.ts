import { supabase } from './supabase';
import type { FinancialDue, FinancialPayment } from './types';

function logFinanceFetchError(operation: string, studentId: string, error: { message: string; code?: string; details?: string; hint?: string }) {
  console.error(`[finances] ${operation} failed — possible RLS block or schema mismatch`, {
    studentId,
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

/** Fetch financial dues for a student (student_id = profiles.id / auth.users.id). */
export async function getFinancialDuesForStudent(studentId: string): Promise<FinancialDue[]> {
  if (!studentId) {
    console.warn('[finances] getFinancialDuesForStudent called with empty studentId');
    return [];
  }

  const { data, error } = await supabase
    .from('financial_dues')
    .select('*, category:categories(id, name)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) {
    logFinanceFetchError('getFinancialDuesForStudent', studentId, error);
    return [];
  }

  const dues = (data as FinancialDue[]) || [];
  if (dues.length === 0) {
    console.info('[finances] getFinancialDuesForStudent returned 0 rows', { studentId });
  } else {
    console.debug('[finances] getFinancialDuesForStudent ok', {
      studentId,
      count: dues.length,
      unpaid: dues.filter((d) => d.status === 'unpaid').length,
    });
  }

  return dues;
}

/** Fetch payment ledger entries for a student. */
export async function getFinancialPaymentsForStudent(studentId: string): Promise<FinancialPayment[]> {
  if (!studentId) {
    console.warn('[finances] getFinancialPaymentsForStudent called with empty studentId');
    return [];
  }

  const { data, error } = await supabase
    .from('financial_payments')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) {
    logFinanceFetchError('getFinancialPaymentsForStudent', studentId, error);
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
    /** Outstanding / pending payment (unpaid dues) */
    totalOwed,
    totalPaidViaDues,
    totalRecorded,
    /** All dues ever billed (unpaid + paid) */
    totalBilled: totalOwed + totalPaidViaDues,
  };
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'نقداً',
  transfer: 'تحويل بنكي',
  other: 'أخرى',
};

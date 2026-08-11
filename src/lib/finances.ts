import type { FinancialDue, FinancialPayment } from './types';

export function sumUnpaidDues(dues: FinancialDue[]): number {
  return dues.filter((d) => d.status === 'unpaid').reduce((s, d) => s + Number(d.amount), 0);
}

export function sumPaidDues(dues: FinancialDue[]): number {
  return dues.filter((d) => d.status === 'paid').reduce((s, d) => s + Number(d.amount), 0);
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

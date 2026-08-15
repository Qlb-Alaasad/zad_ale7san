import { describe, expect, it } from 'vitest';
import {
  sumUnpaidDues,
  sumPaidDues,
  sumPayments,
  financeSummary,
} from './finances';
import type { FinancialDue, FinancialPayment } from './types';

function due(overrides: Partial<FinancialDue> & Pick<FinancialDue, 'id' | 'student_id'>): FinancialDue {
  return {
    category_id: null,
    description: 'Fee',
    amount: 100,
    status: 'unpaid',
    due_date: null,
    notes: '',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function payment(overrides: Partial<FinancialPayment> & Pick<FinancialPayment, 'id' | 'student_id'>): FinancialPayment {
  return {
    due_id: null,
    amount: 50,
    payment_method: 'cash',
    notes: '',
    recorded_by: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('finance aggregation', () => {
  it('sums only unpaid dues', () => {
    const dues = [
      due({ id: 'd1', student_id: 's1', amount: 100, status: 'unpaid' }),
      due({ id: 'd2', student_id: 's1', amount: 50, status: 'paid' }),
      due({ id: 'd3', student_id: 's1', amount: 25, status: 'unpaid' }),
    ];
    expect(sumUnpaidDues(dues)).toBe(125);
  });

  it('sums only paid dues', () => {
    const dues = [
      due({ id: 'd1', student_id: 's1', amount: 100, status: 'unpaid' }),
      due({ id: 'd2', student_id: 's1', amount: 50, status: 'paid' }),
    ];
    expect(sumPaidDues(dues)).toBe(50);
  });

  it('sums payments', () => {
    const payments = [
      payment({ id: 'p1', student_id: 's1', amount: 30 }),
      payment({ id: 'p2', student_id: 's1', amount: 70 }),
    ];
    expect(sumPayments(payments)).toBe(100);
  });

  it('computes full summary', () => {
    const dues = [
      due({ id: 'd1', student_id: 's1', amount: 100, status: 'unpaid' }),
      due({ id: 'd2', student_id: 's1', amount: 50, status: 'paid' }),
    ];
    const payments = [payment({ id: 'p1', student_id: 's1', amount: 50 })];
    const summary = financeSummary(dues, payments);
    expect(summary.totalOwed).toBe(100);
    expect(summary.totalPaidViaDues).toBe(50);
    expect(summary.totalRecorded).toBe(50);
    expect(summary.totalBilled).toBe(150);
  });

  it('handles empty arrays', () => {
    const summary = financeSummary([], []);
    expect(summary.totalOwed).toBe(0);
    expect(summary.totalPaidViaDues).toBe(0);
    expect(summary.totalRecorded).toBe(0);
    expect(summary.totalBilled).toBe(0);
  });

  it('coerces string amounts to numbers', () => {
    const dues = [due({ id: 'd1', student_id: 's1', amount: '75' as unknown as number, status: 'unpaid' })];
    expect(sumUnpaidDues(dues)).toBe(75);
  });
});

import { supabase } from './supabase';
import type { QrCheckInResult } from './types';

/*
 * Sprint 1 — Server-verified QR attendance.
 *
 * The signing secret now lives ONLY in the database (`app_secrets` table,
 * unreachable by API roles). Tokens are issued and verified by the
 * `issue_qr_token` / `check_in_with_qr` SECURITY DEFINER RPCs.
 *
 * Legacy exports (`generateQrPayload`, `verifyQrPayload`, `sessionSecret`)
 * are kept with identical signatures so existing callers keep compiling,
 * but all cryptographic work happens server-side.
 */

export const QR_WINDOW_SECONDS = 60;

/** The 60-second window index for a given moment. */
export function qrWindowFor(date: Date = new Date()): number {
  return Math.floor(date.getTime() / (QR_WINDOW_SECONDS * 1000));
}

/** Accept current or previous window (120s scan-latency tolerance). */
export function isWindowWithinTolerance(window: number, now: Date = new Date()): boolean {
  return Math.abs(qrWindowFor(now) - window) <= 1;
}

export interface ParsedQrPayload {
  s: string;
  w: number;
  h: string;
}

/** Shape-validate a scanned QR payload (no crypto — the server does that). */
export function parseQrPayload(payload: string): ParsedQrPayload | null {
  try {
    const parsed = JSON.parse(payload) as { s?: unknown; w?: unknown; h?: unknown };
    if (
      typeof parsed.s !== 'string' || parsed.s.length === 0 ||
      typeof parsed.w !== 'number' || !Number.isFinite(parsed.w) ||
      typeof parsed.h !== 'string' || parsed.h.length !== 16
    ) {
      return null;
    }
    return { s: parsed.s, w: parsed.w, h: parsed.h };
  } catch {
    return null;
  }
}

/** Staff: fetch a fresh signed token payload from the server for QR display. */
export async function issueQrPayload(sessionId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('issue_qr_token', { p_session_id: sessionId });
  if (error || !data) {
    console.error('[qr] issue_qr_token failed:', error?.message);
    return null;
  }
  return JSON.stringify(data);
}

/**
 * Backward-compatible wrapper used by the admin attendance screen.
 * The `_legacySecret` argument is ignored — signing is server-side now.
 */
export async function generateQrPayload(sessionId: string, _legacySecret?: string): Promise<string> {
  const payload = await issueQrPayload(sessionId);
  return payload ?? JSON.stringify({ s: sessionId, w: 0, h: '0000000000000000' });
}

/**
 * @deprecated The secret is server-side only. Kept so legacy imports compile;
 * always returns an empty string and must not be used for verification.
 */
export function sessionSecret(_sessionId: string): string {
  return '';
}

/**
 * @deprecated Client-side crypto verification no longer exists. This now only
 * shape-checks the payload and checks the time window locally for UX purposes.
 * The authoritative check is `checkInWithQr` (server RPC).
 */
export async function verifyQrPayload(
  payload: string,
  _legacySecret?: string
): Promise<{ valid: boolean; sessionId: string | null; window: number }> {
  const parsed = parseQrPayload(payload);
  if (!parsed) return { valid: false, sessionId: null, window: 0 };
  return {
    valid: isWindowWithinTolerance(parsed.w),
    sessionId: parsed.s,
    window: parsed.w,
  };
}

const CHECK_IN_MESSAGES: Record<string, string> = {
  invalid_payload: 'رمز غير صالح',
  expired: 'رمز منتهي الصلاحية — امسح الرمز المعروض حالياً',
  invalid_signature: 'رمز غير صالح أو مزوّر',
  session_not_found: 'الحصة غير موجودة',
  session_inactive: 'الحصة غير نشطة حالياً. اطلب من المشرف تفعيلها.',
  already_recorded: 'تم تسجيل حضورك مسبقاً لهذه الحصة',
  rpc_error: 'تعذر تسجيل الحضور، حاول مرة أخرى',
  unknown: 'حدث خطأ غير متوقع',
};

/** Student: server-verified check-in — the only way attendance is recorded. */
export async function checkInWithQr(payload: string): Promise<QrCheckInResult> {
  const parsed = parseQrPayload(payload);
  if (!parsed) {
    return { ok: false, code: 'invalid_payload', message: CHECK_IN_MESSAGES.invalid_payload };
  }

  const { data, error } = await supabase.rpc('check_in_with_qr', { p_payload: parsed });
  if (error) {
    console.error('[qr] check_in_with_qr failed:', error.message);
    return { ok: false, code: 'rpc_error', message: CHECK_IN_MESSAGES.rpc_error };
  }

  const code = (data?.code as QrCheckInResult['code']) ?? 'unknown';
  const ok = Boolean(data?.ok);
  const status = data?.status as QrCheckInResult['status'];

  let message = CHECK_IN_MESSAGES[code] ?? CHECK_IN_MESSAGES.unknown;
  if (code === 'checked_in') {
    message = status === 'late' ? 'تم تسجيل حضورك (متأخر)' : 'تم تسجيل الحضور بنجاح';
  }

  return { ok, code, status, message };
}

/**
 * Generate a time-based hash token for QR attendance.
 * The token encodes: sessionId + a 60-second time window.
 * The Sheikh's screen refreshes this every 60s; the student scans and the backend
 * verifies the hash matches the current (or previous) time window.
 */
export async function generateQrPayload(sessionId: string, secret: string): Promise<string> {
  const window = Math.floor(Date.now() / 60000); // 60-second window
  const data = `${sessionId}:${window}:${secret}`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  return JSON.stringify({ s: sessionId, w: window, h: hashHex });
}

/**
 * Verify a scanned QR payload. Returns sessionId if valid (within current or previous window).
 */
export async function verifyQrPayload(
  payload: string,
  secret: string
): Promise<{ valid: boolean; sessionId: string | null; window: number }> {
  try {
    const parsed = JSON.parse(payload);
    const { s, w, h } = parsed as { s: string; w: number; h: string };
    if (!s || !w || !h) return { valid: false, sessionId: null, window: 0 };

    const currentWindow = Math.floor(Date.now() / 60000);
    // Allow current and previous window (120s tolerance for scan latency)
    if (Math.abs(currentWindow - w) > 1) return { valid: false, sessionId: null, window: w };

    const data = `${s}:${w}:${secret}`;
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const expectedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').substring(0, 16);

    return { valid: expectedHash === h, sessionId: s, window: w };
  } catch {
    return { valid: false, sessionId: null, window: 0 };
  }
}

/**
 * A per-session secret. In production this would be stored server-side.
 * For this app, we derive it from the session ID + a static app salt.
 * The edge function uses the same derivation.
 */
export const APP_SALT = 'zad-al-ihsan-2025-attendance-secret';

export function sessionSecret(sessionId: string): string {
  return `${APP_SALT}:${sessionId}`;
}

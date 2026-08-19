import { describe, expect, it } from 'vitest';
import { parseQrPayload, qrWindowFor, isWindowWithinTolerance, sessionSecret } from './qr';

describe('parseQrPayload', () => {
  const valid = JSON.stringify({ s: 'sess-123', w: 12345, h: '0123456789abcdef' });

  it('parses a well-formed payload', () => {
    const result = parseQrPayload(valid);
    expect(result).toEqual({ s: 'sess-123', w: 12345, h: '0123456789abcdef' });
  });

  it('rejects malformed JSON', () => {
    expect(parseQrPayload('not-json')).toBeNull();
  });

  it('rejects missing fields', () => {
    expect(parseQrPayload(JSON.stringify({ s: 'sess-123' }))).toBeNull();
  });

  it('rejects wrong hash length', () => {
    expect(parseQrPayload(JSON.stringify({ s: 'x', w: 1, h: 'abc' }))).toBeNull();
  });

  it('rejects non-numeric window', () => {
    expect(parseQrPayload(JSON.stringify({ s: 'x', w: 'soon', h: '0123456789abcdef' }))).toBeNull();
  });
});

describe('window tolerance', () => {
  it('accepts current and previous window only', () => {
    const now = new Date('2026-08-18T10:00:30Z');
    const w = qrWindowFor(now);
    expect(isWindowWithinTolerance(w, now)).toBe(true);
    expect(isWindowWithinTolerance(w - 1, now)).toBe(true);
    expect(isWindowWithinTolerance(w - 2, now)).toBe(false);
    expect(isWindowWithinTolerance(w + 2, now)).toBe(false);
  });

  it('computes 60-second windows', () => {
    const a = new Date('2026-08-18T10:00:00Z');
    const b = new Date('2026-08-18T10:01:00Z');
    expect(qrWindowFor(b) - qrWindowFor(a)).toBe(1);
  });
});

describe('sessionSecret (deprecated shim)', () => {
  it('returns an empty string — secret is server-side only', () => {
    expect(sessionSecret('any-session')).toBe('');
  });
});

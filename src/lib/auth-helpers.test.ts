import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getSiteOrigin, getOAuthCallbackError, resolvePostAuthPath, dashboardPathForRole } from './auth-helpers';
import type { Profile } from './types';

describe('getSiteOrigin', () => {
  const originalEnv = import.meta.env;

  beforeEach(() => {
    vi.stubGlobal('import.meta.env', { ...originalEnv, VITE_SITE_URL: undefined });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to window.location.origin when env is missing', () => {
    expect(getSiteOrigin()).toBe(window.location.origin);
  });

  it('strips trailing slash from env URL', () => {
    vi.stubGlobal('import.meta.env', { ...originalEnv, VITE_SITE_URL: 'https://example.com/' });
    expect(getSiteOrigin()).toBe('https://example.com');
  });
});

describe('getOAuthCallbackError', () => {
  it('parses error_description from query string', () => {
    // jsdom allows history manipulation
    window.history.pushState({}, '', '/?error_description=access_denied');
    expect(getOAuthCallbackError()).toBe('access_denied');
    window.history.pushState({}, '', '/');
  });

  it('returns null when no error params', () => {
    window.history.pushState({}, '', '/');
    expect(getOAuthCallbackError()).toBeNull();
  });
});

describe('resolvePostAuthPath', () => {
  it('sends pending users to /pending', () => {
    const p = { status: 'pending', role: 'student' } as Profile;
    expect(resolvePostAuthPath(p)).toBe('/pending');
  });

  it('sends rejected users to /pending', () => {
    const p = { status: 'rejected', role: 'student' } as Profile;
    expect(resolvePostAuthPath(p)).toBe('/pending');
  });

  it('sends approved admins to /admin', () => {
    const p = { status: 'approved', role: 'admin' } as Profile;
    expect(resolvePostAuthPath(p)).toBe('/admin');
  });
});

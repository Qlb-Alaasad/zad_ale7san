import { describe, expect, it, beforeEach } from 'vitest';
import { cacheProfile, loadCachedProfile, clearCachedProfile, PROFILE_CACHE_KEY } from './profile-cache';
import type { Profile } from './types';

const mockProfile: Profile = {
  id: 'u1',
  full_name: 'Test User',
  age: 20,
  parent_phone: null,
  role: 'student',
  status: 'approved',
  quran_progress: 0,
  current_module: '',
  created_at: '2026-01-01T00:00:00Z',
};

describe('profile-cache', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips a profile through localStorage', () => {
    cacheProfile(mockProfile);
    const loaded = loadCachedProfile();
    expect(loaded).toEqual(mockProfile);
  });

  it('returns null when cache is empty', () => {
    expect(loadCachedProfile()).toBeNull();
  });

  it('returns null and does not throw on malformed JSON', () => {
    window.localStorage.setItem(PROFILE_CACHE_KEY, 'not-json');
    expect(loadCachedProfile()).toBeNull();
  });

  it('clears cache correctly', () => {
    cacheProfile(mockProfile);
    clearCachedProfile();
    expect(loadCachedProfile()).toBeNull();
  });
});

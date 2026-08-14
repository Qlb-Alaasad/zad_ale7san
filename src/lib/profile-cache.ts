import type { Profile } from './types';

export const PROFILE_CACHE_KEY = 'user_profile';

export function loadCachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (raw) return JSON.parse(raw) as Profile;
  } catch {
    // ignore malformed cache
  }
  return null;
}

export function cacheProfile(profile: Profile) {
  localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
}

export function clearCachedProfile() {
  localStorage.removeItem(PROFILE_CACHE_KEY);
}

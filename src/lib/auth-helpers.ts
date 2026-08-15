import type { User, UserMetadata } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { cacheProfile } from './profile-cache';
import type { Profile } from './types';
import { dashboardPathForRole } from './roles';

const OAUTH_SESSION_WAIT_MS = 15_000;

/** Production Netlify URL or local dev origin — falls back to runtime origin. */
export function getSiteOrigin(): string {
  const envUrl = import.meta.env.VITE_SITE_URL as string | undefined;
  if (envUrl?.trim()) return envUrl.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

/** Parse OAuth error params Supabase may append to the callback URL. */
export function getOAuthCallbackError(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error_description') || params.get('error');
  return error?.trim() || null;
}

/** OAuth redirect target; must be allowlisted in Supabase Auth → URL Configuration. */
export function getAuthCallbackUrl(): string {
  return `${getSiteOrigin()}/auth/callback`;
}

export function resolvePostAuthPath(profile: Profile): string {
  if (profile.status === 'pending' || profile.status === 'rejected') return '/pending';
  return dashboardPathForRole(profile.role);
}

const PROFILE_RETRY_MS = [300, 600, 900, 1200, 1500];

function displayNameFromMetadata(metadata?: UserMetadata | null): string {
  if (!metadata) return 'طالب جديد';
  return (
    (metadata.full_name as string | undefined) ||
    (metadata.name as string | undefined) ||
    'طالب جديد'
  );
}

/** Wait for DB trigger profile or create a safe fallback row for OAuth users. */
export async function ensureUserProfile(user: User): Promise<Profile | null> {
  const uid = user.id;

  for (const delay of PROFILE_RETRY_MS) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) {
      console.error('[auth] profile fetch failed:', error.message);
    }
    if (data) return data as Profile;
    await new Promise((r) => setTimeout(r, delay));
  }

  const fullName = displayNameFromMetadata(user.user_metadata);
  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: uid,
        full_name: fullName,
        role: 'student',
        status: 'pending',
      },
      { onConflict: 'id' }
    )
    .select('*')
    .maybeSingle();

  if (insertError) {
    console.error('[auth] profile fallback upsert failed:', insertError.message);
    return null;
  }

  return created as Profile | null;
}

export async function syncProfileCache(user: User): Promise<Profile | null> {
  const profile = await ensureUserProfile(user);
  if (profile) cacheProfile(profile);
  return profile;
}

/**
 * Wait until Supabase finishes exchanging the OAuth code/hash from the callback URL.
 * Uses getSession first, then listens for SIGNED_IN / INITIAL_SESSION.
 */
export async function waitForAuthUser(timeoutMs = OAUTH_SESSION_WAIT_MS): Promise<User | null> {
  const { data: initial, error: initialError } = await supabase.auth.getSession();
  if (initialError) {
    console.error('[auth] getSession during OAuth wait failed:', initialError.message);
  }
  if (initial.session?.user) return initial.session.user;

  return new Promise((resolve) => {
    let settled = false;

    const finish = (user: User | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
      resolve(user);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session?.user) finish(session.user);
      }
    });
  });
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const redirectTo = getAuthCallbackUrl();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error) {
    console.error('[auth] Google OAuth failed:', error.message);
    if (error.message.includes('provider_not_enabled') || error.message.includes('provider')) {
      return { error: 'تسجيل الدخول عبر جوجل غير مفعّل حالياً، يرجى استخدام البريد الإلكتروني' };
    }
    return { error: error.message };
  }

  return { error: null };
}

export async function completeAuthSession(): Promise<{ profile: Profile | null; error: string | null }> {
  const oauthError = getOAuthCallbackError();
  if (oauthError) {
    console.error('[auth] OAuth callback error:', oauthError);
    return { profile: null, error: oauthError };
  }

  const user = await waitForAuthUser();
  if (!user) {
    return { profile: null, error: 'no_session' };
  }

  const profile = await syncProfileCache(user);
  if (!profile) {
    return { profile: null, error: 'profile_missing' };
  }

  return { profile, error: null };
}

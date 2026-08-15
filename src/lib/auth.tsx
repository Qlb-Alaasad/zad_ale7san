import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ensureUserProfile } from './auth-helpers';
import { cacheProfile, clearCachedProfile, loadCachedProfile } from './profile-cache';
import type { Profile } from './types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export { PROFILE_CACHE_KEY, loadCachedProfile, cacheProfile } from './profile-cache';
const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  // Hydrate synchronously from localStorage so the app renders the correct
  // dashboard immediately on refresh — before any Supabase network call.
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(loadCachedProfile);
  const [loading, setLoading] = useState(() => loadCachedProfile() === null);
  const mountedRef = useRef(true);
  const profileLoadedRef = useRef<string | null>(loadCachedProfile()?.id ?? null);
  const initialSettledRef = useRef(false);

  const setProfileAndCache = (p: Profile | null) => {
    if (!mountedRef.current) return;
    setProfile(p);
    if (p) {
      cacheProfile(p);
      profileLoadedRef.current = p.id;
    } else {
      clearCachedProfile();
      profileLoadedRef.current = null;
    }
  };

  const loadProfile = async (uid: string) => {
    if (!mountedRef.current) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    let profile: Profile | null = null;

    if (user?.id === uid) {
      profile = await ensureUserProfile(user);
    } else {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
      if (error) {
        console.error('Failed to load profile:', error.message);
        return;
      }
      profile = data as Profile | null;
    }

    setProfileAndCache(profile);
  };

  useEffect(() => {
    mountedRef.current = true;

    const finishInitial = () => {
      if (!initialSettledRef.current && mountedRef.current) {
        initialSettledRef.current = true;
        setLoading(false);
      }
    };

    // Primary session check — reads from Supabase's own localStorage persistence
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('getSession error:', error.message);
        finishInitial();
        return;
      }
      if (!mountedRef.current) return;
      setSession(data.session);

      if (data.session?.user) {
        // Refresh profile from DB to pick up any changes, but DON'T clear
        // the cached profile if this fails — the cache is still valid.
        loadProfile(data.session.user.id).finally(finishInitial);
      } else {
        // No Supabase session. BUT: don't nuke the cache during initial load
        // — it may just not have been restored yet. Only clear if we truly
        // have no session after the initial check AND no cache existed.
        if (!loadCachedProfile()) {
          setProfileAndCache(null);
        }
        finishInitial();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mountedRef.current) return;
      setSession(newSession);

      if (event === 'SIGNED_OUT') {
        // Explicit sign-out — this is the ONLY place we clear the cache.
        setProfileAndCache(null);
        finishInitial();
        return;
      }

      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        if (newSession?.user && profileLoadedRef.current !== newSession.user.id) {
          loadProfile(newSession.user.id);
        }
        finishInitial();
        return;
      }

      // INITIAL_SESSION and any other event: do NOT clear the cached profile.
      // The cached profile is our source of truth until we get a real session.
      if (newSession?.user && profileLoadedRef.current !== newSession.user.id) {
        loadProfile(newSession.user.id);
      }

      finishInitial();
    });

    return () => {
      mountedRef.current = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id ?? session?.user?.id;
    if (uid) await loadProfile(uid);
  }, [session?.user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfileAndCache(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

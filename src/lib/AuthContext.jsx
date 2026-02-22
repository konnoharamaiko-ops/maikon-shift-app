import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext();

// Cache profile in sessionStorage for instant restore
const PROFILE_CACHE_KEY = 'shift_app_profile_cache';

const getCachedProfile = (email) => {
  try {
    const cached = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.email === email && Date.now() - parsed.timestamp < 10 * 60 * 1000) {
        return parsed.profile;
      }
    }
  } catch { /* ignore */ }
  return null;
};

const setCachedProfile = (email, profile) => {
  try {
    sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
      email, profile, timestamp: Date.now(),
    }));
  } catch { /* ignore */ }
};

const clearCachedProfile = () => {
  try { sessionStorage.removeItem(PROFILE_CACHE_KEY); } catch { /* ignore */ }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [isInviteFlow, setIsInviteFlow] = useState(false);
  const initRef = useRef(false);
  const profileRef = useRef(null);
  const sessionHandledRef = useRef(false);

  // Fetch User record with timeout and retry
  const fetchUserRecord = useCallback(async (email, timeoutMs = 10000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      console.log('[Auth] Fetching user record for:', email, 'timeout:', timeoutMs);
      const { data, error } = await supabase
        .from('User').select('*').eq('email', email).single()
        .abortSignal(controller.signal);
      clearTimeout(timeoutId);
      if (error) {
        console.warn('[Auth] fetchUserRecord error:', error.code, error.message);
      } else {
        console.log('[Auth] fetchUserRecord success:', data?.full_name);
      }
      return { data, error };
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('[Auth] fetchUserRecord exception:', err.name, err.message);
      return { data: null, error: err };
    }
  }, []);

  // Fetch User record with retry logic
  const fetchUserRecordWithRetry = useCallback(async (email, maxRetries = 3, timeoutMs = 10000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`[Auth] fetchUserRecord attempt ${attempt}/${maxRetries}`);
      const result = await fetchUserRecord(email, timeoutMs);
      
      if (result.data) {
        return result;
      }
      
      // If it's a "not found" error (PGRST116), don't retry
      if (result.error?.code === 'PGRST116') {
        return result;
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`[Auth] Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    
    // All retries failed
    console.warn('[Auth] All retry attempts failed for:', email);
    return { data: null, error: new Error('All retry attempts failed') };
  }, [fetchUserRecord]);

  // Create User from PendingInvitation (invite flow only)
  const createUserFromInvitation = useCallback(async (email) => {
    try {
      const { data: pendingData, error: pendingError } = await supabase
        .from('PendingInvitation').select('*').eq('email', email).limit(1).single();
      
      if (pendingError || !pendingData) return null;

      console.log('[Auth] Found PendingInvitation, creating User for:', email);
      const newUserRecord = {
        id: crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 24) : Math.random().toString(36).slice(2, 26),
        email,
        full_name: pendingData.full_name,
        user_role: pendingData.role || 'user',
        store_ids: pendingData.store_ids || (pendingData.store_id ? [pendingData.store_id] : []),
        is_active: true,
        metadata: { display_name: pendingData.full_name, employment_type: 'part_time' },
      };
      
      const { data: createdUser, error: createError } = await supabase
        .from('User').insert(newUserRecord).select().single();
      
      if (createError) {
        if (createError.code === '23505' || createError.message?.includes('duplicate')) {
          const { data: existingUser } = await supabase
            .from('User').select('*').eq('email', email).single();
          if (existingUser) {
            try { await supabase.from('PendingInvitation').delete().eq('id', pendingData.id); } catch {}
            return existingUser;
          }
        }
        return null;
      }
      
      if (createdUser) {
        console.log('[Auth] User created:', createdUser.full_name);
        try { await supabase.from('PendingInvitation').delete().eq('id', pendingData.id); } catch {}
        return createdUser;
      }
    } catch (err) {
      console.warn('[Auth] createUserFromInvitation error:', err.message);
    }
    return null;
  }, []);

  // Fetch profile - cache first, then network with retry
  const fetchProfile = useCallback(async (email, options = {}) => {
    const { isInvite = false } = options;
    
    console.log('[Auth] fetchProfile called for:', email, 'isInvite:', isInvite);
    
    // INSTANT: Check sessionStorage cache
    const cached = getCachedProfile(email);
    if (cached) {
      console.log('[Auth] Profile from cache:', cached.full_name);
      setProfile(cached);
      profileRef.current = cached;
      // Background refresh (no abort, longer timeout)
      fetchUserRecord(email, 15000).then(({ data }) => {
        if (data) { setProfile(data); profileRef.current = data; setCachedProfile(email, data); }
      }).catch(() => {});
      return cached;
    }

    // NETWORK: Fetch from Supabase with retry
    const { data, error } = await fetchUserRecordWithRetry(email, 3, 10000);
    
    if (!error && data) {
      console.log('[Auth] Profile loaded:', data.full_name);
      setProfile(data);
      profileRef.current = data;
      setCachedProfile(email, data);
      return data;
    }
    
    // No User record found - try invite flow
    if (error?.code === 'PGRST116' && isInvite) {
      const createdUser = await createUserFromInvitation(email);
      if (createdUser) {
        setProfile(createdUser);
        profileRef.current = createdUser;
        setCachedProfile(email, createdUser);
        return createdUser;
      }
    }
    
    console.warn('[Auth] fetchProfile failed for:', email, 'error:', error?.message || error?.code);
    return null;
  }, [fetchUserRecord, fetchUserRecordWithRetry, createUserFromInvitation]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    let isMounted = true;

    console.log('[Auth] Initializing...');

    // Force Service Worker update on load
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) reg.update().catch(() => {});
      }).catch(() => {});
    }

    // Detect invite/signup flow from URL
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);
    const hasAuthTokenInHash = hashParams.has('access_token') || hashParams.has('refresh_token');
    const hasAuthCodeInQuery = queryParams.has('code');
    const hasTokenHashInQuery = queryParams.has('token_hash');
    const authType = hashParams.get('type') || queryParams.get('type');
    const isInviteOrSignup = hasAuthTokenInHash || hasAuthCodeInQuery || hasTokenHashInQuery;
    
    if (isInviteOrSignup) {
      console.log('[Auth] Auth tokens in URL, type:', authType);
      if (authType === 'invite' || authType === 'signup' || authType === 'magiclink') {
        setIsInviteFlow(true);
      }
    }

    // Handle token_hash verification
    if (hasTokenHashInQuery) {
      const tokenHash = queryParams.get('token_hash');
      const type = queryParams.get('type') || 'invite';
      supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        .then(({ error }) => {
          if (error && isMounted) {
            setAuthError('招待リンクの検証に失敗しました。リンクの有効期限が切れている可能性があります。');
            setIsLoadingAuth(false);
          } else {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        });
    }

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] State change:', event, session?.user?.email);
      if (!isMounted) return;

      if (event === 'SIGNED_OUT') {
        sessionHandledRef.current = false;
        setUser(null);
        setProfile(null);
        profileRef.current = null;
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
        setIsInviteFlow(false);
        clearCachedProfile();
        return;
      }

      // For TOKEN_REFRESHED, just update the user but don't re-fetch profile
      if (event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          setUser(session.user);
        }
        return;
      }

      // Skip duplicate SIGNED_IN handling if profile already loaded
      if (sessionHandledRef.current && session?.user?.email) {
        console.log('[Auth] Session already handled, profileRef:', profileRef.current?.full_name);
        if (profileRef.current) {
          // Profile already loaded, ensure authenticated state
          setIsAuthenticated(true);
          setIsLoadingAuth(false);
          return;
        }
        // Profile not loaded yet, try again
        console.log('[Auth] Profile missing, retrying fetch...');
      }

      if (session?.user) {
        sessionHandledRef.current = true;
        setUser(session.user);
        setIsLoadingAuth(true);
        
        console.log('[Auth] Fetching profile for:', session.user.email);
        let profileData = await fetchProfile(session.user.email, { 
          isInvite: isInviteOrSignup
        });
        
        if (!isMounted) return;
        
        // For invite flow, retry once if no profile found
        if (!profileData && isInviteOrSignup) {
          console.log('[Auth] Invite flow: retrying after 2s...');
          await new Promise(r => setTimeout(r, 2000));
          profileData = await fetchProfile(session.user.email, { 
            isInvite: true
          });
          if (!isMounted) return;
        }
        
        // For normal login, also retry once if failed
        if (!profileData && !isInviteOrSignup) {
          console.log('[Auth] Normal login: retrying after 2s...');
          await new Promise(r => setTimeout(r, 2000));
          profileData = await fetchProfile(session.user.email, { 
            isInvite: false
          });
          if (!isMounted) return;
        }
        
        if (!profileData) {
          // Unregistered user - sign out
          console.error('[Auth] Profile not found after all retries, signing out');
          setAuthError('このメールアドレスは登録されていません。\n管理者からの招待を受けてからログインしてください。');
          try { await supabase.auth.signOut(); } catch {}
          setUser(null);
          setProfile(null);
          profileRef.current = null;
          setIsAuthenticated(false);
          setIsLoadingAuth(false);
          setIsInviteFlow(false);
          sessionHandledRef.current = false;
          clearCachedProfile();
          return;
        }
        
        // Clean URL tokens
        if (hasAuthTokenInHash || hasAuthCodeInQuery || hasTokenHashInQuery) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        
        console.log('[Auth] Authentication complete:', profileData.full_name);
        setIsAuthenticated(true);
        setIsLoadingAuth(false);
        setIsInviteFlow(false);
      } else {
        // No session
        setUser(null);
        setProfile(null);
        profileRef.current = null;
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
      }
    });

    // Safety timeout: show login screen if nothing happens
    const safetyMs = isInviteOrSignup ? 15000 : 8000;
    const safetyTimeoutId = setTimeout(() => {
      if (isMounted) {
        console.warn(`[Auth] Safety timeout after ${safetyMs / 1000}s`);
        setIsLoadingAuth(false);
      }
    }, safetyMs);

    return () => {
      isMounted = false;
      clearTimeout(safetyTimeoutId);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const logout = async () => {
    sessionHandledRef.current = false;
    clearCachedProfile();
    try { await supabase.auth.signOut(); } catch {}
    setUser(null);
    setProfile(null);
    profileRef.current = null;
    setIsAuthenticated(false);
  };

  const login = async (email, password) => {
    sessionHandledRef.current = false;
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setIsLoadingAuth(false);
        throw error;
      }
      return data;
    } catch (error) {
      setIsLoadingAuth(false);
      throw error;
    }
  };

  // Combined user object
  const currentUser = profile ? {
    ...profile,
    auth_id: user?.id,
    auth_email: user?.email,
    full_name: profile.full_name || profile.metadata?.display_name || user?.email,
    display_name: profile.metadata?.display_name || profile.full_name || user?.email,
    user_role: profile.user_role || 'user',
    store_ids: profile.store_ids || [],
    email: profile.email || user?.email,
  } : user ? {
    id: user.id,
    email: user.email,
    full_name: user.email,
    display_name: user.email,
    user_role: 'user',
    store_ids: [],
    metadata: {},
  } : null;

  return (
    <AuthContext.Provider value={{ 
      user: currentUser,
      authUser: user,
      profile,
      isAuthenticated, 
      isLoadingAuth,
      authError,
      isInviteFlow,
      logout,
      login,
      refreshProfile: () => user?.email ? fetchProfile(user.email) : Promise.resolve(null),
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

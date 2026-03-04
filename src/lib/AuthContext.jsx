import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [isInviteFlow, setIsInviteFlow] = useState(false);
  const isMountedRef = useRef(true);

  // Fetch user profile - standalone function, no dependencies
  const fetchProfile = async (email) => {
    try {
      console.log('[Auth] Fetching profile for:', email);
      const { data, error } = await supabase
        .from('User').select('*').eq('email', email).single();
      if (error) {
        console.log('[Auth] Profile query error:', error.code, error.message);
        return null;
      }
      console.log('[Auth] Profile found:', data?.full_name);
      return data;
    } catch (err) {
      console.log('[Auth] Profile exception:', err.message);
      return null;
    }
  };

  // Create user from PendingInvitation
  const createFromInvitation = async (email) => {
    try {
      const { data: pending } = await supabase
        .from('PendingInvitation').select('*').eq('email', email).limit(1).single();
      if (!pending) return null;

      console.log('[Auth] Creating user from invitation:', email);
      const newUser = {
        id: crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 24) : Math.random().toString(36).slice(2, 26),
        email,
        full_name: pending.full_name,
        user_role: pending.role || 'user',
        store_ids: pending.store_ids || (pending.store_id ? [pending.store_id] : []),
        is_active: true,
        metadata: { display_name: pending.full_name, employment_type: 'part_time' },
      };
      
      const { data: created, error } = await supabase
        .from('User').insert(newUser).select().single();
      
      if (error) {
        if (error.code === '23505') return await fetchProfile(email);
        return null;
      }
      
      try { await supabase.from('PendingInvitation').delete().eq('id', pending.id); } catch {}
      return created;
    } catch {
      return null;
    }
  };

  // Load profile and set state
  const loadAndSetProfile = async (authUser) => {
    const email = authUser.email;
    
    // Attempt 1: fetch from User table
    let profileData = await fetchProfile(email);

    // Attempt 2: if no profile, always try to create from PendingInvitation
    if (!profileData) {
      console.log('[Auth] No profile found, trying PendingInvitation...');
      profileData = await createFromInvitation(email);
    }

    // Attempt 3: retry fetch after 1s (in case of race condition)
    if (!profileData) {
      console.log('[Auth] Still no profile, retrying in 1s...');
      await new Promise(r => setTimeout(r, 1000));
      profileData = await fetchProfile(email);
    }

    if (!isMountedRef.current) return false;

    if (profileData) {
      // Check if account is active
      if (profileData.is_active === false) {
        console.log('[Auth] Account is deactivated:', profileData.email);
        const errMsg = 'このアカウントは無効化されています。\n管理者にお問い合わせください。';
        setUser(null);
        setProfile(null);
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
        setIsInviteFlow(false);
        return { success: false, errorMessage: errMsg, needsSignOut: true };
      }
      console.log('[Auth] Login complete:', profileData.full_name);
      setUser(authUser);
      setProfile(profileData);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthError(null);
      setIsInviteFlow(false);
      return { success: true };
    } else {
      console.log('[Auth] No profile found');
      const errMsg = 'このメールアドレスは登録されていません。\n管理者からの招待を受けてからログインしてください。';
      setUser(null);
      setProfile(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      setIsInviteFlow(false);
      return { success: false, errorMessage: errMsg, needsSignOut: true };
    }
  };

  // Initialize: check existing session on mount
  useEffect(() => {
    isMountedRef.current = true;

    // Detect invite flow from URL
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);
    const hasAuthToken = hashParams.has('access_token') || queryParams.has('code') || queryParams.has('token_hash');
    const authType = hashParams.get('type') || queryParams.get('type');
    const isInvite = hasAuthToken && (authType === 'invite' || authType === 'signup' || authType === 'magiclink');

    if (isInvite) setIsInviteFlow(true);

    // Handle token_hash verification
    if (queryParams.has('token_hash')) {
      const tokenHash = queryParams.get('token_hash');
      const type = queryParams.get('type') || 'invite';
      supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        .then(({ error }) => {
          if (error && isMountedRef.current) {
            setAuthError('招待リンクの検証に失敗しました。');
            setIsLoadingAuth(false);
          } else {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        });
    }

    // Check initial session
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[Auth] Initial session:', session?.user?.email || 'none');

        if (session?.user) {
          // Clean URL tokens
          if (hasAuthToken) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          await loadAndSetProfile(session.user);
        } else {
          if (isMountedRef.current) {
            setIsLoadingAuth(false);
          }
        }
      } catch (err) {
        console.log('[Auth] Init error:', err.message);
        if (isMountedRef.current) {
          setIsLoadingAuth(false);
        }
      }
    };

    initAuth();

    // Listen for auth state changes (sign out, token refresh only)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth] Event:', event);
      if (!isMountedRef.current) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
        setIsInviteFlow(false);
      }

      if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(session.user);
      }

      // We do NOT handle SIGNED_IN or INITIAL_SESSION here
      // Login is handled by the login() function directly
      // Initial session is handled by initAuth() above
    });

    return () => {
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  // ジョブカンコードでログイン
  const loginWithJobcanCode = async (jobcanCode, password) => {
    setAuthError(null);
    try {
      // バックエンドAPIでジョブカンコード→メールアドレス変換＋認証
      const apiRes = await fetch('/api/auth/jobcan-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobcan_code: jobcanCode, password }),
      });
      const apiData = await apiRes.json();
      if (!apiRes.ok) {
        throw new Error(apiData.error || 'ログインに失敗しました。');
      }
      // 取得したトークンでSupabaseセッションを設定
      const { data, error } = await supabase.auth.setSession({
        access_token: apiData.access_token,
        refresh_token: apiData.refresh_token,
      });
      if (error) throw error;
      setIsLoadingAuth(true);
      const result = await loadAndSetProfile(data.user);
      if (result && !result.success) {
        const errorMessage = result.errorMessage || 'ログインに失敗しました。';
        if (result.needsSignOut) supabase.auth.signOut().catch(() => {});
        setIsLoadingAuth(false);
        throw new Error(errorMessage);
      }
      return data;
    } catch (error) {
      setIsLoadingAuth(false);
      throw error;
    }
  };

  // Login function - handles everything directly
  const login = async (email, password) => {
    // NOTE: Do NOT setIsLoadingAuth(true) here.
    // App.jsx uses isLoadingAuth to show loading screen, which unmounts Login.jsx.
    // If Login.jsx is unmounted, its error state is lost and error messages won't display.
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }

      // Now that signIn succeeded, set loading to show loading screen
      setIsLoadingAuth(true);

      // Directly load profile - don't rely on onAuthStateChange
      const result = await loadAndSetProfile(data.user);
      if (result && !result.success) {
        const errorMessage = result.errorMessage || 'ログインに失敗しました。';
        
        // Sign out silently in background
        if (result.needsSignOut) {
          supabase.auth.signOut().catch(() => {});
        }
        
        setIsLoadingAuth(false);
        throw new Error(errorMessage);
      }
      return data;
    } catch (error) {
      setIsLoadingAuth(false);
      throw error;
    }
  };

  const logout = async () => {
    try { await supabase.auth.signOut(); } catch {}
    setUser(null);
    setProfile(null);
    setIsAuthenticated(false);
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
      loginWithJobcanCode,
      refreshProfile: async () => {
        if (!user?.email) return null;
        try {
          const { data } = await supabase.from('User').select('*').eq('email', user.email).single();
          if (data) setProfile(data);
          return data;
        } catch { return null; }
      },
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

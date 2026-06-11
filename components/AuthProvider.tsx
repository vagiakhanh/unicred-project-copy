'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { useRouter, usePathname } from 'next/navigation';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  university: string | null;
  major: string | null;
  bio: string | null;
  avatar_url: string | null;
  credits: number;   // Staking credits
  so_du: number;     // VND budget pool (Số dư)
  trust_score: number;
  freelancer_reputation: number;
  client_reputation: number;
  reputation: number;
  is_verified: boolean;
  student_card_url: string | null;
  facebook_url: string | null;
  gmail_url: string | null;
  role: 'user' | 'admin';
  is_banned: boolean;
  flagged_reason: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Bug 1 & 2 Fix: Track whether initUser is still running so the auth
  // listener doesn't race with it, causing double fetches and flicker.
  const isInitializing = useRef(true);

  const userRef = useRef<User | null>(null);
  const profileRef = useRef<UserProfile | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const buildFallbackProfile = (uid: string, email: string): UserProfile => ({
    id: uid,
    email,
    name: email ? email.split('@')[0] : 'Sinh Viên',
    university: 'Đại học Bách Khoa Hà Nội (HUST)',
    major: 'Chưa cập nhật',
    credits: 100,
    so_du: 0,
    trust_score: 0,
    freelancer_reputation: 100,
    client_reputation: 100,
    reputation: 100,
    is_verified: false,
    avatar_url: null,
    bio: null,
    student_card_url: null,
    facebook_url: null,
    gmail_url: null,
    role: 'user',
    is_banned: false,
    flagged_reason: null,
  });

  const fetchProfile = async (uid: string, email = '') => {
    try {
      console.log(`[Auth] Đang tải hồ sơ sinh viên cho UID: ${uid}`);
      const PROFILE_TIMEOUT_MS = 8000;
      const { data, error } = await Promise.race([
        supabase.from('users').select('*').eq('id', uid).single(),
        new Promise<{ data: null; error: { message: string } }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: { message: 'Profile fetch timeout' } }), PROFILE_TIMEOUT_MS)
        ),
      ]);

      if (error || !data) {
        console.log('Profile not found, creating automatically');
        // Resolve email if not provided
        if (!email) {
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          email = currentUser?.email || '';
        }

        const fallbackProfile = buildFallbackProfile(uid, email);

        const { data: newProfile, error: insertError } = await supabase
          .from('users')
          .insert([fallbackProfile])
          .select()
          .single();

        if (insertError) {
          console.error('[Auth Error] Tự động tạo hồ sơ thất bại:', insertError);
          setProfile(fallbackProfile);
        } else {
          setProfile(newProfile as UserProfile);
        }
      } else {
        console.log('[Auth] Tải hồ sơ người dùng thành công:', data);
        setProfile(data as UserProfile);
      }
    } catch (err) {
      console.error('[Auth Exception] Lỗi ngoại lệ trong fetchProfile:', err);
      setProfile(buildFallbackProfile(uid, email));
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const initUser = async () => {
    try {
      setLoading(true);
      isInitializing.current = true;

      // 1. Check session first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.log('No active session or session error, redirecting to login');
        setUser(null);
        setProfile(null);
        // Force redirect to login immediately if we are not on an auth route
        const isAuthRoute = window.location.pathname === '/login' || window.location.pathname === '/signup';
        if (!isAuthRoute) {
          window.location.href = '/login';
        }
        return;
      }

      const activeUser = session.user;
      setUser(activeUser);

      // 2. Fetch profile — single fetch, no duplicate from the listener
      await fetchProfile(activeUser.id, activeUser.email || '');
    } catch (err) {
      console.error('[Auth Exception] Lỗi trong initUser:', err);
    } finally {
      isInitializing.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    initUser();

    // Safety timeout: if loading is still true after 10 seconds, force-clear it.
    // Prevents permanent stuck-loading if Supabase never responds.
    const safetyTimeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) console.warn('[Auth] Loading timeout — clearing stuck state');
        return false;
      });
    }, 10000);

    // Listen to active auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[Auth Event] Sự kiện Auth thay đổi: ${event}`);

      // While initUser is still running, ignore listener events
      if (isInitializing.current) {
        console.log('[Auth] initUser đang chạy, bỏ qua sự kiện listener.');
        return;
      }

      const activeUser = session?.user ?? null;

      // For TOKEN_REFRESHED and visibility-driven session checks, skip profile re-fetch
      // This prevents unnecessary DB calls and state thrashing on tab refocus
      if (
        (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') &&
        activeUser?.id === userRef.current?.id &&
        profileRef.current
      ) {
        console.log('[Auth] Session refreshed, same user — skipping profile re-fetch.');
        return;
      }

      setUser(activeUser);

      if (activeUser) {
        await fetchProfile(activeUser.id, activeUser.email || '');
      } else {
        setProfile(null);
      }

      if (event !== 'TOKEN_REFRESHED') {
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  // 3. Client-side Route protections
  useEffect(() => {
    if (loading) return;
    const isAuthRoute = pathname === '/login' || pathname === '/signup';

    if (!user && !isAuthRoute) {
      router.push('/login');
    } else if (user && isAuthRoute) {
      router.push('/');
    }
  }, [user, pathname, loading, router]);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      localStorage.clear();
      setUser(null);
      setProfile(null);
      window.location.href = '/login';
    } catch (err) {
      console.error('Error during signOut:', err);
      localStorage.clear();
      window.location.href = '/login';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm font-semibold text-text-muted animate-pulse">Loading...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

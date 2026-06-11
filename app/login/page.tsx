'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
// useRouter removed: AuthProvider handles navigation on SIGNED_IN

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  // Bug 3 & 7 Fix: router is no longer needed here.
  // AuthProvider's route-protection effect handles the redirect to '/' once
  // the session is confirmed — removing the competing navigation and
  // the unnecessary 1-second artificial delay.

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!email.trim() || !password.trim()) {
      return setErrorMsg('Vui lòng điền đầy đủ email và mật khẩu đăng nhập.');
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      // AuthProvider's onAuthStateChange + route-protection effect will
      // automatically redirect to '/' — no manual push or delay needed.
      setSuccessMsg('Đăng nhập thành công! Đang chuyển hướng...');
    } catch (err: any) {
      console.error('Login failed:', err);
      setErrorMsg(err.message || 'Sai tài khoản hoặc mật khẩu. Vui lòng kiểm tra lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      {/* Subtle Glow Effects */}
      <div className="absolute top-10 left-10 h-72 w-72 rounded-full bg-indigo-500/5 blur-3xl -z-10" />
      <div className="absolute bottom-10 right-10 h-72 w-72 rounded-full bg-purple-500/5 blur-3xl -z-10" />

      <div className="w-full max-w-md rounded-2xl border border-border-color bg-card-bg p-8 shadow-card">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl font-black text-white shadow-lg mb-3">
            U
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Đăng nhập UniCred</h1>
          <p className="text-xs text-text-muted mt-1.5">
            Cổng thông tin chợ việc làm sinh viên - Đăng nhập tài khoản trường.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs font-semibold text-rose-600 dark:text-rose-500">
            ⚠️ {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-semibold text-emerald-600 dark:text-emerald-500">
            ✓ {successMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
              Email Sinh Viên
            </label>
            <input
              id="email"
              type="email"
              required
              placeholder="ten@school.edu.vn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              className="w-full form-input rounded-xl px-4 py-3 text-sm"
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="password" className="block text-[10px] font-black uppercase tracking-wider text-text-muted">
                Mật khẩu
              </label>
            </div>
            <input
              id="password"
              type="password"
              required
              placeholder="Nhập mật khẩu của bạn"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              className="w-full form-input rounded-xl px-4 py-3 text-sm"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full relative flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-3 text-sm font-bold text-white shadow-lg hover:from-blue-500 hover:to-purple-500 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-150 cursor-pointer mt-6 shadow-md"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border border-t-transparent border-white" />
                Đang xác thực...
              </>
            ) : (
              'Đăng nhập'
            )}
          </button>
        </form>

        <div className="text-center mt-6 text-xs text-text-muted">
          Chưa có tài khoản?{' '}
          <Link href="/signup" className="font-bold text-indigo-600 hover:underline">
            Đăng ký ngay (.edu.vn)
          </Link>
        </div>
      </div>
    </div>
  );
}

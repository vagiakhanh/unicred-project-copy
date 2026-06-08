'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

export default function Navbar() {
  const { profile, loading, signOut } = useAuth();
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  // Notifications state
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notiDropdownOpen, setNotiDropdownOpen] = useState(false);

  // Initialize theme from localStorage on load
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme as 'light' | 'dark');
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Fetch unread notifications
  const fetchNotifications = async () => {
    if (!profile) return;
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.error('[Notifications] Lỗi khi nạp thông báo:', err);
    }
  };

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!profile) return;

    fetchNotifications();

    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT (new notification) and UPDATE (marked as read)
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setNotifications((prev) => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updatedNoti = payload.new;
            if (updatedNoti.is_read) {
              setNotifications((prev) => prev.filter((n) => n.id !== updatedNoti.id));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  // Request browser notification permissions on mount if not already granted
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Handle notification click: mark as read and open chat conversation
  const handleNotificationClick = async (noti: any) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', noti.id);

      if (error) throw error;
      setNotifications((prev) => prev.filter((n) => n.id !== noti.id));

      if (noti.conversation_id) {
        window.location.href = `/?chat=${noti.conversation_id}`;
      }
    } catch (err) {
      console.error('[Notifications] Lỗi xử lý click thông báo:', err);
    }
  };

  // Toggle Dark/Light mode
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Compute Gamified Level: Lv. 1 up to Lv. 10
  const reputation = profile?.reputation ?? 100;
  const userLevel = Math.max(1, Math.min(10, Math.floor(reputation / 100)));

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border-color bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Brand Logo Link to Dashboard */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="relative">
            <div className="absolute -inset-1 rounded-lg bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 opacity-70 blur-md transition duration-1000 group-hover:duration-200 animate-pulse"></div>
            <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-xl font-black text-white shadow-xl">
              U
            </div>
          </div>
          <span className="ml-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 bg-clip-text text-2xl font-black tracking-wider text-transparent">
            UniCred
          </span>
          <span className="hidden sm:inline-block rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-400">
            Sinh Viên
          </span>
        </Link>

        {/* Right Nav Options */}
        <div className="flex items-center gap-4">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-xl border border-border-color bg-card-bg text-foreground hover:bg-border-color transition-colors shadow-sm cursor-pointer"
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          {profile && (
            <>
              {/* Reputation & Level */}
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/5 px-3.5 py-1.5 shadow-[0_0_15px_rgba(245,158,11,0.04)]">
                <span className="text-xs">⭐</span>
                <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Uy tín:</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-black text-amber-500">{reputation}</span>
                  <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 text-[8px] font-black text-amber-400">
                    Cấp {userLevel}
                  </span>
                </div>
              </div>

              {/* Số dư: VND budget pool */}
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-1.5 shadow-[0_0_15px_rgba(16,185,129,0.04)]">
                <span className="text-xs">💰</span>
                <span className="hidden md:inline text-[10px] text-text-muted font-bold uppercase tracking-wider">Số dư:</span>
                <span className="text-xs sm:text-sm font-black text-emerald-500 tracking-wide">
                  {(profile.so_du ?? 0).toLocaleString('vi-VN')}₫
                </span>
              </div>

              {/* Credits: staking balance */}
              <div className="flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 px-3.5 py-1.5 shadow-[0_0_15px_rgba(99,102,241,0.04)]">
                <span className="text-xs">🪙</span>
                <span className="hidden md:inline text-[10px] text-text-muted font-bold uppercase tracking-wider">Credits:</span>
                <span className="text-xs sm:text-sm font-black text-indigo-500 tracking-wide">
                  {profile.credits ?? 0}
                </span>
              </div>

              {/* Notification Bell Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setNotiDropdownOpen(!notiDropdownOpen)}
                  className="relative p-2.5 rounded-xl border border-border-color bg-card-bg text-foreground hover:bg-border-color transition-colors shadow-sm cursor-pointer focus:outline-none"
                  aria-label="Notifications"
                >
                  🔔
                  {notifications.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[9px] text-white font-black animate-pulse shadow-md">
                      {notifications.length}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown Menu */}
                {notiDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setNotiDropdownOpen(false)} />
                    <div className="absolute right-0 mt-2.5 w-72 z-20 rounded-2xl border border-border-color bg-white dark:bg-slate-900 p-2 shadow-2xl animate-fade-in max-h-96 overflow-y-auto">
                      <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800">
                        <span className="block text-xs font-black text-slate-900 dark:text-slate-100">
                          Thông báo tin nhắn ({notifications.length})
                        </span>
                      </div>
                      
                      {notifications.length === 0 ? (
                        <div className="py-8 px-4 text-center text-xs text-text-muted italic">
                          Không có thông báo mới nào
                        </div>
                      ) : (
                        notifications.map((noti) => (
                          <button
                            key={noti.id}
                            onClick={() => {
                              setNotiDropdownOpen(false);
                              handleNotificationClick(noti);
                            }}
                            className="w-full flex flex-col items-start gap-1 rounded-xl px-3 py-2.5 text-xs text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors mt-1 border border-transparent cursor-pointer"
                          >
                            <span className="font-bold text-slate-850 dark:text-slate-100 block truncate w-full">
                              📩 {noti.content}
                            </span>
                            <span className="text-[9px] text-slate-400 font-bold block">
                              {new Date(noti.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Profile Avatar Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-1 border border-border-color rounded-xl p-1 bg-card-bg hover:bg-border-color transition-all cursor-pointer focus:outline-none"
                >
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt="Avatar"
                      className="h-8 w-8 rounded-lg object-cover shadow-sm border border-slate-700/20"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-black text-white">
                      {profile.name ? profile.name.slice(0, 2).toUpperCase() : 'SV'}
                    </div>
                  )}
                  {/* Verified Student Badge */}
                  {profile.is_verified ? (
                    <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-blue-600 border-2 border-slate-950 text-[8px] text-white font-bold" title="Sinh viên đã xác thực">
                      ✓
                    </span>
                  ) : (
                    <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-slate-600 border-2 border-slate-950 text-[8px] text-white font-bold" title="Đang chờ xác thực">
                      ?
                    </span>
                  )}
                </button>

                {/* Dropdown Menu */}
                {dropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                    <div className="absolute right-0 mt-2.5 w-52 z-20 rounded-2xl border border-border-color bg-card-bg p-2 shadow-2xl animate-fade-in">
                      <div className="px-3.5 py-2.5 border-b border-border-color">
                        <span className="block text-xs font-black text-foreground truncate">
                          {profile.name || 'Sinh Viên'}
                        </span>
                        <span className="block text-[10px] text-text-muted truncate">
                          {profile.email}
                        </span>
                      </div>
                      
                      <Link
                        href="/profile"
                        onClick={() => setDropdownOpen(false)}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-foreground hover:bg-border-color transition-colors mt-1"
                      >
                        👤 Hồ sơ cá nhân
                      </Link>

                      {profile.role === 'admin' && (
                        <Link
                          href="/admin"
                          onClick={() => setDropdownOpen(false)}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-black text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 transition-colors mt-1"
                        >
                          🛡️ Quản trị Admin
                        </Link>
                      )}

                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          signOut();
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-500/10 transition-colors mt-1 text-left cursor-pointer"
                      >
                        🚪 Đăng xuất
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

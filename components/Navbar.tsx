'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { parseUtcDate } from '@/lib/vietnamTime';

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

  // Fetch all notifications (unread + recently read), newest first
  const fetchNotifications = async () => {
    if (!profile) return;
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.error('[Notifications] Lỗi khi nạp thông báo:', err);
    }
  };

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!profile?.id) return;

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
            // Mark as read in-place (keep it visible but greyed)
            setNotifications((prev) =>
              prev.map((n) => n.id === payload.new.id ? { ...n, ...payload.new } : n)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  // Request browser notification permissions on mount if not already granted
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Handle notification click: mark as read and optionally redirect
  const handleNotificationClick = async (noti: any) => {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', noti.id);

      setNotifications((prev) =>
        prev.map((n) => n.id === noti.id ? { ...n, is_read: true } : n)
      );

      if (noti.conversation_id) {
        window.location.href = `/?chat=${noti.conversation_id}`;
      } else if (noti.job_id) {
        // Redirect to the page with the job (just reload — user will see it)
        window.location.href = '/';
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

  // Compute reputation for display
  const reputation = profile?.reputation ?? 100;

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
                <span className="text-xs font-black text-amber-500">{reputation}</span>
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
                  {notifications.filter((n) => !n.is_read).length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[9px] text-white font-black animate-pulse shadow-md">
                      {notifications.filter((n) => !n.is_read).length}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown Menu */}
                {notiDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setNotiDropdownOpen(false)} />
                    <div className="absolute right-0 mt-2.5 w-80 z-20 rounded-2xl border border-border-color bg-white dark:bg-slate-900 p-2 shadow-2xl animate-fade-in max-h-96 overflow-y-auto">
                      <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <span className="block text-xs font-black text-slate-900 dark:text-slate-100">
                          Thông báo ({notifications.filter((n) => !n.is_read).length} mới)
                        </span>
                        {notifications.some((n) => !n.is_read) && (
                          <button
                            onClick={async () => {
                              await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile.id).eq('is_read', false);
                              setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
                            }}
                            className="text-[9px] text-indigo-500 font-bold hover:underline cursor-pointer"
                          >
                            Đọc tất cả
                          </button>
                        )}
                      </div>
                      
                      {notifications.length === 0 ? (
                        <div className="py-8 px-4 text-center text-xs text-text-muted italic">
                          Không có thông báo nào
                        </div>
                      ) : (
                        // Sort: unread first, then read
                        [...notifications]
                          .sort((a, b) => {
                            if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
                            return parseUtcDate(b.created_at).getTime() - parseUtcDate(a.created_at).getTime();
                          })
                          .map((noti) => {
                            const isRead = noti.is_read;
                            const hasConvLink = noti.conversation_id && ['job_applied', 'job_confirmed', 'job_completed_pending', 'message'].includes(noti.type);
                            const hasConfirmLink = noti.type === 'job_completed_pending';
                            const icon = noti.type === 'job_applied' ? '📩'
                              : noti.type === 'job_confirmed' ? '✅'
                              : noti.type === 'job_completed_pending' ? '🏁'
                              : noti.type === 'job_done_confirmed' ? '🎉'
                              : '🔔';
                            return (
                              <button
                                key={noti.id}
                                onClick={() => {
                                  setNotiDropdownOpen(false);
                                  handleNotificationClick(noti);
                                }}
                                className={`w-full flex flex-col items-start gap-1 rounded-xl px-3 py-2.5 text-xs text-left transition-colors mt-1 border cursor-pointer ${
                                  isRead
                                    ? 'border-transparent hover:bg-slate-50 opacity-60'
                                    : 'border-indigo-500/10 bg-indigo-500/5 hover:bg-indigo-500/10'
                                }`}
                              >
                                <span className={`font-bold block w-full ${
                                  isRead ? 'text-slate-400' : 'text-slate-850 dark:text-slate-100'
                                }`}>
                                  {icon} {noti.content}
                                </span>
                                {hasConfirmLink && (
                                  <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                                    ✔️ Bấm vào đây để xác nhận
                                  </span>
                                )}
                                {hasConvLink && !hasConfirmLink && (
                                  <span className="text-[10px] text-indigo-500 font-bold flex items-center gap-1">
                                    💬 Bấm vào đây để trò chuyện
                                  </span>
                                )}
                                {noti.type === 'job_done_confirmed' && (
                                  <span className="text-[10px] text-amber-500 font-bold">
                                    Chúc bạn một ngày mới tốt lành! 🌟
                                  </span>
                                )}
                                {noti.type === 'low_rating_received' && (
                                  <span className="text-[10px] text-rose-500 font-bold block mt-0.5 leading-relaxed">
                                    Hãy liên hệ với người thuê để gỡ bỏ đánh giá hoặc liên hệ với chúng tôi qua unicredadmin@gmail.com
                                  </span>
                                )}
                                <span className={`text-[9px] font-bold block ${
                                  isRead ? 'text-slate-300' : 'text-slate-400'
                                }`}>
                                  {parseUtcDate(noti.created_at).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </button>
                            );
                          })
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

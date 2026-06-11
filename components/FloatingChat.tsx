'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { parseUtcDate } from '@/lib/vietnamTime';

interface ConvRow {
  id: string;
  job_id: string;
  worker_id: string;
  jobTitle: string;
  otherUserId: string;
  otherName: string;
  lastMessage: string;
  lastMessageTime: string; // ISO string for sorting
  unreadCount: number;
}

interface ProfileInfo {
  name: string;
  email: string;
  university?: string;
  reputation?: number;
  credits?: number;
}

interface FloatingChatProps {
  activeUserId: string;
  activeUserName: string;
  onOpenConversation: (convId: string, jobTitle: string, otherName: string) => void;
}

export default function FloatingChat({
  activeUserId,
  activeUserName,
  onOpenConversation,
}: FloatingChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const [profileModal, setProfileModal] = useState<ProfileInfo | null>(null);

  // Simplified: single query using two separate fetches then merge
  const loadConversations = useCallback(async () => {
    if (!activeUserId) return;
    setLoading(true);
    try {
      // Step 1: fetch conversations where user is the worker
      const { data: asWorker } = await supabase
        .from('conversations')
        .select('id, job_id, worker_id')
        .eq('worker_id', activeUserId)
        .order('id', { ascending: false })
        .limit(20);

      // Step 2: fetch conversations where user owns the job
      const { data: myJobs } = await supabase
        .from('jobs')
        .select('id, owner_id')
        .eq('owner_id', activeUserId)
        .limit(50);

      let asOwner: any[] = [];
      if (myJobs && myJobs.length > 0) {
        const jobIds = myJobs.map((j: any) => j.id);
        const { data: oc } = await supabase
          .from('conversations')
          .select('id, job_id, worker_id')
          .in('job_id', jobIds)
          .order('id', { ascending: false })
          .limit(20);
        asOwner = oc || [];
      }

      // Merge and deduplicate
      const seen = new Set<string>();
      const allConvIds: { id: string; job_id: string; worker_id: string; isWorker: boolean }[] = [];
      for (const c of [...(asWorker || []), ...asOwner]) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          allConvIds.push({ ...c, isWorker: c.worker_id === activeUserId });
        }
      }

      if (allConvIds.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // Step 3: batch fetch all job titles
      const uniqueJobIds = [...new Set(allConvIds.map((c) => c.job_id))];
      const { data: jobsData } = await supabase
        .from('jobs')
        .select('id, title, owner_id')
        .in('id', uniqueJobIds);
      const jobMap: Record<string, { title: string; owner_id: string }> = {};
      (jobsData || []).forEach((j: any) => { jobMap[j.id] = j; });

      // Step 4: batch fetch all other party user profiles
      const otherUserIds = allConvIds.map((c) => {
        const job = jobMap[c.job_id];
        return c.isWorker ? (job?.owner_id || null) : c.worker_id;
      }).filter(Boolean) as string[];

      const uniqueOtherIds = [...new Set(otherUserIds)];
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', uniqueOtherIds);
      const userMap: Record<string, { name: string | null; email: string }> = {};
      (usersData || []).forEach((u: any) => { userMap[u.id] = u; });

      // Step 5: batch fetch unread counts via single query
      const convIds = allConvIds.map((c) => c.id);
      const { data: unreadMsgs } = await supabase
        .from('messages')
        .select('id, conversation_id')
        .in('conversation_id', convIds)
        .neq('sender_id', activeUserId)
        .eq('seen', false);

      const unreadByConv: Record<string, number> = {};
      (unreadMsgs || []).forEach((m: any) => {
        unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] || 0) + 1;
      });

      // Step 6: batch fetch last messages
      const { data: lastMsgs } = await supabase
        .from('messages')
        .select('conversation_id, content, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false });

      const lastMsgByConv: Record<string, { content: string; time: string }> = {};
      (lastMsgs || []).forEach((m: any) => {
        if (!lastMsgByConv[m.conversation_id]) {
          lastMsgByConv[m.conversation_id] = { content: m.content, time: m.created_at };
        }
      });

      // Assemble
      const result: ConvRow[] = allConvIds.map((c) => {
        const job = jobMap[c.job_id];
        const otherUserId = c.isWorker ? (job?.owner_id || '') : c.worker_id;
        const otherUser = userMap[otherUserId];
        return {
          id: c.id,
          job_id: c.job_id,
          worker_id: c.worker_id,
          jobTitle: job?.title || 'Công việc',
          otherUserId,
          otherName: otherUser?.name || otherUser?.email?.split('@')[0] || 'Người dùng',
          lastMessage: lastMsgByConv[c.id]?.content || '',
          lastMessageTime: lastMsgByConv[c.id]?.time || '',
          unreadCount: unreadByConv[c.id] || 0,
        };
      });

      // Sort: conversations with most recent message first
      result.sort((a, b) => {
        if (!a.lastMessageTime && !b.lastMessageTime) return 0;
        if (!a.lastMessageTime) return 1;
        if (!b.lastMessageTime) return -1;
        return parseUtcDate(b.lastMessageTime).getTime() - parseUtcDate(a.lastMessageTime).getTime();
      });

      setConversations(result);
      setTotalUnread(result.reduce((s, c) => s + c.unreadCount, 0));
    } catch (err) {
      console.error('[FloatingChat] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeUserId]);

  useEffect(() => {
    if (isOpen) loadConversations();
  }, [isOpen, loadConversations]);

  // Lightweight unread poll when panel is closed
  useEffect(() => {
    if (!activeUserId) return;
    const poll = async () => {
      try {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .neq('sender_id', activeUserId)
          .eq('seen', false);
        setTotalUnread(count || 0);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 20000);
    return () => clearInterval(interval);
  }, [activeUserId]);

  const handleOpenProfile = async (userId: string) => {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from('users')
        .select('name, email, university, freelancer_reputation, credits')
        .eq('id', userId)
        .single();
      if (data) {
        setProfileModal({
          name: data.name || data.email?.split('@')[0] || 'Sinh Viên',
          email: data.email,
          university: data.university,
          reputation: data.freelancer_reputation,
          credits: data.credits,
        });
      }
    } catch (err) {
      console.error('[FloatingChat] Profile error:', err);
    }
  };

  return (
    <>
      {/* Profile Modal */}
      {profileModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm"
          onClick={() => setProfileModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 max-w-xs w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-xl">
                {(profileModal.name?.[0] || 'U').toUpperCase()}
              </div>
              <div>
                <p className="font-black text-slate-900">{profileModal.name}</p>
                <p className="text-xs text-slate-500">{profileModal.email}</p>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {profileModal.university && (
                <p className="text-slate-600">🏫 {profileModal.university}</p>
              )}
              <p className="text-slate-600">⭐ Uy tín: <span className="font-bold text-amber-500">{profileModal.reputation ?? 100}/100</span></p>
              <p className="text-slate-600">🪙 Credits: <span className="font-bold text-indigo-500">{profileModal.credits ?? 0}</span></p>
            </div>
            <button
              onClick={() => setProfileModal(null)}
              className="mt-4 w-full text-center text-xs font-bold text-slate-500 hover:text-slate-700 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-all cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Conversation Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-[60] w-80 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[480px]">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center justify-between">
            <span className="text-sm font-black text-white">💬 Tin nhắn</span>
            <button onClick={() => setIsOpen(false)} className="text-white/70 hover:text-white text-lg leading-none cursor-pointer">✕</button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-8 flex flex-col items-center gap-2">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                <span className="text-xs text-slate-400">Đang tải...</span>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                <p className="text-2xl mb-2">💬</p>
                <p>Chưa có cuộc trò chuyện nào.</p>
                <p className="mt-1 text-[11px]">Nhắn tin với ứng viên qua các bài đăng.</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => {
                    setIsOpen(false);
                    onOpenConversation(conv.id, conv.jobTitle, conv.otherName);
                  }}
                >
                  <button
                    className="h-10 w-10 min-w-[40px] rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-black text-sm flex-shrink-0 hover:scale-105 transition-transform cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); handleOpenProfile(conv.otherUserId); }}
                    title="Xem hồ sơ"
                  >
                    {(conv.otherName[0] || 'U').toUpperCase()}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <button
                        className="text-xs font-black text-slate-900 truncate hover:text-indigo-600 transition-colors cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleOpenProfile(conv.otherUserId); }}
                      >
                        {conv.otherName}
                      </button>
                      {conv.unreadCount > 0 && (
                        <span className="flex-shrink-0 h-5 min-w-[20px] rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center px-1">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-indigo-500 font-semibold truncate">💼 {conv.jobTitle}</p>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      {conv.lastMessage && (
                        <p className="text-[11px] text-slate-400 truncate flex-1">{conv.lastMessage}</p>
                      )}
                      {conv.lastMessageTime && (
                        <span className="text-[9px] text-slate-300 font-bold flex-shrink-0">
                          {parseUtcDate(conv.lastMessageTime).toLocaleTimeString('vi-VN', {
                            timeZone: 'Asia/Ho_Chi_Minh',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Bubble Button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-[60] h-14 w-14 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 cursor-pointer border-2 border-white"
        title="Mở tin nhắn"
      >
        <span className="text-2xl">{isOpen ? '✕' : '💬'}</span>
        {totalUnread > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 h-5 min-w-[20px] rounded-full bg-rose-500 border-2 border-white text-white text-[10px] font-black flex items-center justify-center px-1">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>
    </>
  );
}

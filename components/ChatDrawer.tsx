'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { parseUtcDate } from '@/lib/vietnamTime';

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  seen: boolean;
  seen_at: string | null;
  created_at: string;
}

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string | null;
  jobTitle: string;
  otherPartyName: string;
  activeUserId: string;
  activeUserName: string;
}

export default function ChatDrawer({
  isOpen,
  onClose,
  conversationId,
  jobTitle,
  otherPartyName,
  activeUserId,
  activeUserName,
}: ChatDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Typing state
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [typingNames, setTypingNames] = useState('');

  const messageEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const presenceChannelRef = useRef<any>(null);

  // Mark all unread messages from other party as seen
  const markMessagesAsSeen = useCallback(async () => {
    if (!conversationId || !activeUserId) return;
    try {
      const { error } = await supabase
        .from('messages')
        .update({
          seen: true,
          seen_at: new Date().toISOString(),
        })
        .eq('conversation_id', conversationId)
        .neq('sender_id', activeUserId)
        .eq('seen', false);

      if (error) throw error;
    } catch (err) {
      console.error('[Chat] Lỗi khi đánh dấu đã xem:', err);
    }
  }, [conversationId, activeUserId]);

  // Fetch messages from Supabase (Limit 50 latest, chronological order)
  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .range(0, 49); // Paginate to latest 50 messages

      if (error) throw error;

      // Reverse in memory to display chronologically
      setMessages(data ? [...(data as Message[])].reverse() : []);
      
      // Update seen status
      await markMessagesAsSeen();
    } catch (err) {
      console.error('[Chat] Lỗi khi tải tin nhắn:', err);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, markMessagesAsSeen]);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Track user typing state
  const sendTypingState = useCallback(async (isTyping: boolean) => {
    if (!presenceChannelRef.current) return;
    try {
      await presenceChannelRef.current.track({
        user_id: activeUserId,
        name: activeUserName,
        typing: isTyping,
      });
    } catch (err) {
      console.error('[Chat] Lỗi gửi trạng thái Presence:', err);
    }
  }, [activeUserId, activeUserName]);

  // Load messages on open
  useEffect(() => {
    if (isOpen && conversationId) {
      loadMessages();
    } else {
      setMessages([]);
    }
  }, [conversationId, isOpen, loadMessages]);

  // Scroll on message updates
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  // Subscribe to Realtime messages (INSERT, UPDATE) and notification triggers
  useEffect(() => {
    if (!isOpen || !conversationId) return;

    console.log(`[Chat] Đăng ký Live Messages cho conversation: ${conversationId}`);
    const channel = supabase
      .channel(`chat_messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new as Message;
            console.log('[Chat] Tin nhắn mới realtime:', newMsg);

            if (newMsg.sender_id !== activeUserId) {
              markMessagesAsSeen();
              newMsg.seen = true;
              newMsg.seen_at = new Date().toISOString();

              // Browser push notifications if tab is hidden
              if (document.hidden) {
                if (Notification.permission === 'granted') {
                  new Notification(`Tin nhắn mới từ ${otherPartyName}`, {
                    body: newMsg.content,
                  });
                }
              }
            }

            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedMsg = payload.new as Message;
            console.log('[Chat] Tin nhắn cập nhật realtime (seen status):', updatedMsg);
            setMessages((prev) =>
              prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
            );
          }
        }
      )
      .subscribe();

    return () => {
      console.log(`[Chat] Hủy đăng ký Live Messages cho conversation: ${conversationId}`);
      supabase.removeChannel(channel);
    };
  }, [conversationId, isOpen, activeUserId, otherPartyName, markMessagesAsSeen]);

  // Subscribe to Typing Indicator Presence Channel
  useEffect(() => {
    if (!isOpen || !conversationId) return;

    const channel = supabase.channel(`typing:${conversationId}`);
    presenceChannelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const typingUsers: string[] = [];

        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            if (p.user_id !== activeUserId && p.typing === true) {
              typingUsers.push(p.name || 'Sinh Viên');
            }
          });
        });

        setIsOtherTyping(typingUsers.length > 0);
        setTypingNames(typingUsers.join(', '));
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
      presenceChannelRef.current = null;
    };
  }, [conversationId, isOpen, activeUserId]);

  // Handle typing input changes (Debounced)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    
    // Set typing state to true
    sendTypingState(true);

    // Debounce: stop typing state after 1500ms of inactivity
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingState(false);
    }, 1500);
  };

  // Send message handler
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !conversationId || isSending) return;

    const content = inputText.trim();
    setInputText('');
    setIsSending(true);

    // Stop typing indicator on submit
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTypingState(false);

    // Optimistic UI update
    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: activeUserId,
      content,
      seen: false,
      seen_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMessage]);

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert([
          {
            conversation_id: conversationId,
            sender_id: activeUserId,
            content,
            seen: false,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      // Replace temp message with database confirmed message
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? (data as Message) : m))
      );
    } catch (err) {
      console.error('[Chat] Lỗi gửi tin nhắn:', err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputText(content); // Restore input text
    } finally {
      setIsSending(false);
    }
  };

  // Format date and time in Vietnam timezone
  const formatTime = useCallback((isoString: string) => {
    const d = parseUtcDate(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  // Format seen time in Vietnam timezone
  const formatSeenTime = useCallback((isoString: string | null) => {
    if (!isoString) return '';
    const d = parseUtcDate(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, []);

  // Memoized rendered messages
  const renderedMessages = useMemo(() => {
    return messages.map((msg, index) => {
      const isMe = msg.sender_id === activeUserId;
      const isLastMessage = index === messages.length - 1;

      return (
        <div
          key={msg.id}
          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
              isMe
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-none'
                : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
            }`}
          >
            <p className="break-words leading-relaxed">{msg.content}</p>
          </div>
          <div className="flex items-center gap-1.5 mt-1 px-1">
            <span className="text-[9px] text-slate-400 font-bold">
              {formatTime(msg.created_at)}
            </span>
            {isMe && (
              <span className="text-[9px] font-black text-indigo-500 uppercase tracking-wide">
                {msg.seen ? `✓✓ Đã xem ${formatSeenTime(msg.seen_at)}` : '✓ Đã gửi'}
              </span>
            )}
          </div>
        </div>
      );
    });
  }, [messages, activeUserId, formatTime, formatSeenTime]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="min-w-0">
            <h2 className="text-sm font-black text-slate-900 truncate">
              Trò chuyện: {otherPartyName}
            </h2>
            <p className="text-[10px] font-bold text-indigo-600 truncate mt-0.5">
              💼 Công việc: {jobTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-450 hover:bg-slate-200 hover:text-slate-700 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Messages list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50">
          {isLoading ? (
            <div className="h-full flex items-center justify-center flex-col gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              <span className="text-xs text-slate-400">Đang tải cuộc hội thoại...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <span className="text-3xl mb-2">👋</span>
              <p className="text-xs font-bold text-slate-800 mb-1">Gửi lời chào đầu tiên!</p>
              <p className="text-[11px] text-slate-500 max-w-[240px]">
                Hãy bắt đầu nhắn tin để thảo luận chi tiết hơn về công việc và thỏa thuận hợp tác.
              </p>
            </div>
          ) : (
            renderedMessages
          )}
          
          {/* Typing Indicator */}
          {isOtherTyping && (
            <div className="flex flex-col items-start animate-pulse">
              <div className="bg-slate-100 border border-slate-200 text-slate-500 text-xs rounded-2xl rounded-tl-none px-4 py-2 flex items-center gap-1.5">
                <span className="font-semibold">{typingNames} đang gõ tin nhắn</span>
                <span className="flex gap-0.5">
                  <span className="h-1 w-1 rounded-full bg-slate-450 animate-bounce delay-100" />
                  <span className="h-1 w-1 rounded-full bg-slate-450 animate-bounce delay-200" />
                  <span className="h-1 w-1 rounded-full bg-slate-450 animate-bounce delay-300" />
                </span>
              </div>
            </div>
          )}
          
          <div ref={messageEndRef} />
        </div>

        {/* Input box */}
        <form
          onSubmit={handleSendMessage}
          className="p-4 border-t border-slate-200 bg-white flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="Nhập nội dung tin nhắn..."
            value={inputText}
            onChange={handleInputChange}
            disabled={!conversationId || isLoading || isSending}
            className="flex-1 border border-slate-250 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-600 bg-white text-slate-900 placeholder-slate-400"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || !conversationId || isSending}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs px-4 py-3.5 shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            {isSending ? (
              <div className="h-4 w-4 animate-spin rounded-full border border-t-transparent border-white" />
            ) : (
              'Gửi'
            )}
          </button>
        </form>
      </div>
    </>
  );
}

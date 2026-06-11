'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface UserProfileData {
  id: string;
  name: string | null;
  email: string;
  university: string | null;
  major: string | null;
  bio: string | null;
  avatar_url: string | null;
  credits: number;
  reputation: number;
  freelancer_reputation: number;
  client_reputation: number;
  trust_score: number;
  is_verified: boolean;
  facebook_url: string | null;
  gmail_url: string | null;
  is_banned: boolean;
}

interface UserProfileModalProps {
  isOpen: boolean;
  userId: string | null;
  onClose: () => void;
  /** Label hiển thị: 'Người đăng bài' hoặc 'Người nhận việc' */
  roleLabel?: string;
}

export default function UserProfileModal({ isOpen, userId, onClose, roleLabel }: UserProfileModalProps) {
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !userId) return;

    const fetchProfile = async () => {
      setLoading(true);
      setUserProfile(null);
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, email, university, major, bio, avatar_url, credits, reputation, freelancer_reputation, client_reputation, trust_score, is_verified, facebook_url, gmail_url, is_banned')
          .eq('id', userId)
          .single();

        if (error) throw error;
        setUserProfile(data as UserProfileData);
      } catch (err) {
        console.error('[UserProfileModal] Failed to fetch profile:', err);
        setUserProfile(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const reputation = userProfile?.reputation ?? 100;
  const freelancerRep = userProfile?.freelancer_reputation ?? 100;
  const clientRep = userProfile?.client_reputation ?? 100;
  const trustScore = userProfile?.trust_score ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Modal Card Container */}
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl relative border border-slate-100 flex flex-col gap-5 text-slate-900 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer text-xl font-bold p-1"
          aria-label="Close modal"
        >
          ✕
        </button>

        {/* Header Label */}
        {roleLabel && (
          <div className="text-center">
            <span className="inline-block rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-600">
              {roleLabel}
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <span className="text-xs font-bold text-slate-500">Đang tải hồ sơ...</span>
          </div>
        ) : !userProfile ? (
          <div className="text-center py-8">
            <span className="text-4xl">🔍</span>
            <h3 className="mt-2 text-sm font-black text-slate-900">Không tìm thấy hồ sơ</h3>
            <p className="mt-1 text-xs text-slate-500">Thành viên này có thể không tồn tại hoặc đã bị xóa.</p>
          </div>
        ) : (
          <>
            {/* Main Profile Avatar & Basic Info */}
            <div className="text-center">
              <div className="relative inline-block mb-3">
                {userProfile.avatar_url ? (
                  <img
                    src={userProfile.avatar_url}
                    alt={userProfile.name || 'User Avatar'}
                    className="w-20 h-20 rounded-full object-cover shadow-sm border border-slate-100 mx-auto"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-black text-white shadow-md mx-auto">
                    {userProfile.name ? userProfile.name.slice(0, 2).toUpperCase() : 'SV'}
                  </div>
                )}
                {userProfile.is_verified && (
                  <span className="absolute bottom-0 right-0 rounded-full bg-blue-500 border-2 border-white p-1 text-white flex items-center justify-center text-[8px] w-5 h-5 shadow-sm" title="Đã xác thực">
                    ✓
                  </span>
                )}
              </div>

              <h3 className="text-lg font-black text-slate-900 truncate px-4">
                {userProfile.name || 'Sinh Viên'}
              </h3>
              <p className="text-xs text-slate-500 font-medium truncate mb-1">
                {userProfile.university || 'Đại học'}
              </p>
              {userProfile.major && (
                <span className="inline-block rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600">
                  📚 {userProfile.major}
                </span>
              )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
              <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center">
                <span className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Uy tín Freelancer</span>
                <span className="text-sm font-black text-indigo-600">⭐ {freelancerRep}%</span>
              </div>
              <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center">
                <span className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Uy tín Client</span>
                <span className="text-sm font-black text-indigo-600">⭐ {clientRep}%</span>
              </div>
              <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center">
                <span className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Điểm Tích Lũy</span>
                <span className="text-sm font-black text-emerald-600">💰 {userProfile.credits}</span>
              </div>
              <div className="bg-white border border-slate-100 rounded-xl p-2.5 text-center">
                <span className="block text-[8px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Điểm Uy Tín</span>
                <span className="text-sm font-black text-amber-500">🔥 {trustScore}</span>
              </div>
            </div>

            {/* Bio Section */}
            {userProfile.bio ? (
              <div className="space-y-1">
                <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Giới thiệu</span>
                <p className="text-xs font-medium text-slate-600 bg-slate-50/50 border border-slate-100 rounded-xl p-3 max-h-24 overflow-y-auto leading-relaxed">
                  {userProfile.bio}
                </p>
              </div>
            ) : (
              <p className="text-center text-xs italic text-slate-400 my-1">Thành viên này chưa viết bio giới thiệu.</p>
            )}

            {/* Contact Information */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Thông tin liên hệ</span>
              
              <div className="flex flex-col gap-2">
                {/* Gmail Address */}
                <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-500 flex items-center gap-1.5">
                    ✉️ Gmail
                  </span>
                  {userProfile.gmail_url ? (
                    <a
                      href={`mailto:${userProfile.gmail_url}`}
                      className="font-black text-indigo-600 hover:text-indigo-500 transition-colors"
                    >
                      {userProfile.gmail_url}
                    </a>
                  ) : (
                    <span className="text-slate-400 italic">Chưa liên kết</span>
                  )}
                </div>

                {/* Facebook Link */}
                <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-500 flex items-center gap-1.5">
                    🔗 Facebook
                  </span>
                  {userProfile.facebook_url ? (
                    <a
                      href={userProfile.facebook_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-black text-indigo-600 hover:text-indigo-500 transition-colors truncate max-w-[200px]"
                    >
                      Facebook Profile
                    </a>
                  ) : (
                    <span className="text-slate-400 italic">Chưa liên kết</span>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
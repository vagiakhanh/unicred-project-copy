'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabaseClient';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

export default function ProfilePage() {
  const { profile, loading: authLoading, refreshProfile } = useAuth();
  
  // Local Form states
  const [name, setName] = useState('');
  const [major, setMajor] = useState('');
  const [bio, setBio] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [gmailUrl, setGmailUrl] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Pre-populate fields on load
  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setMajor(profile.major || '');
      setBio(profile.bio || '');
      setFacebookUrl(profile.facebook_url || '');
      setGmailUrl(profile.gmail_url || '');
    }
  }, [profile]);

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span className="text-xs text-text-muted">Đang đồng bộ hồ sơ...</span>
        </div>
      </div>
    );
  }

  // Handle avatar file uploads
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setErrorMsg('');
    setSuccessMsg('');
    setUploadingAvatar(true);

    try {
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('unicred-media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage
        .from('unicred-media')
        .getPublicUrl(filePath);

      const avatarUrl = data.publicUrl;

      // Update avatar_url in users database
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: avatarUrl })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      setSuccessMsg('Đã cập nhật ảnh đại diện thành công!');
      await refreshProfile();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Lỗi khi tải lên ảnh đại diện.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Handle Form Submission
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    
    if (!name.trim()) return setErrorMsg('Vui lòng nhập tên hiển thị.');
    if (!major.trim()) return setErrorMsg('Vui lòng nhập chuyên ngành đào tạo.');

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('users')
        .update({
          name: name.trim(),
          major: major.trim(),
          bio: bio.trim(),
          facebook_url: facebookUrl.trim(),
          gmail_url: gmailUrl.trim(),
        })
        .eq('id', profile.id);

      if (error) throw error;

      setSuccessMsg('Đã lưu thông tin hồ sơ thành công!');
      await refreshProfile();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Lỗi khi lưu thông tin hồ sơ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const reputation = profile.reputation ?? 100;

  // COMMON INPUT CLASS TO KEEP UI CONSISTENT
  const inputClassName = "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3.5 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10";
  const labelClassName = "mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500";

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      <Navbar />

      <main className="flex-1 mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Navigation back to dashboard */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-500 font-bold mb-6">
          ← Quay lại Bảng tin việc làm
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT: Avatar box & Stats card */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              
              {/* Profile image picker */}
              <div className="relative mx-auto w-24 h-24 mb-4 group">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="Avatar"
                    className="w-24 h-24 rounded-full object-cover shadow-sm"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl font-black text-white shadow-lg">
                    {profile.name ? profile.name.slice(0, 2).toUpperCase() : 'SV'}
                  </div>
                )}
                
                {/* Upload overlay hover trigger */}
                <label
                  htmlFor="avatar-input"
                  className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 text-[10px] font-black uppercase text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-2 border-indigo-500/40"
                >
                  {uploadingAvatar ? 'Đang tải...' : 'Thay ảnh'}
                  <input
                    id="avatar-input"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    disabled={uploadingAvatar}
                    className="hidden"
                  />
                </label>
              </div>

              <h2 className="text-lg font-black tracking-tight text-slate-900 truncate mb-0.5">{profile.name || 'Sinh Viên'}</h2>
              <span className="text-xs font-medium text-slate-500 block truncate mb-4">{profile.email}</span>

              {/* Verified badge indicators */}
              {profile.is_verified ? (
                <span className="inline-flex items-center justify-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600">
                  <span className="text-sm leading-none">✓</span> Đã xác thực sinh viên
                </span>
              ) : (
                <span className="inline-flex items-center justify-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-600">
                  <span className="text-sm leading-none">⚠️</span> Đang đợi duyệt thẻ
                </span>
              )}

              <div className="h-px bg-slate-100 w-full my-5" />

              {/* Stats detail */}
              <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-200/50 bg-amber-50/50 p-3.5">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">Điểm Uy Tín</span>
                <span className="text-lg font-black text-amber-500">⭐ {reputation}</span>
              </div>
            </div>

            {/* Profile guide box */}
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-xs font-medium text-indigo-800 shadow-sm">
              <span className="mr-1.5 text-base leading-none">💡</span>
              <strong className="font-black">Mẹo:</strong> Hãy điền đầy đủ chuyên ngành đào tạo và tài khoản mạng xã hội để tăng mức độ tin tưởng đối với các nhà tuyển dụng khi đăng ký ứng tuyển việc làm!
            </div>
          </div>

          {/* RIGHT: Form editor (8 cols) */}
          <div className="lg:col-span-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <h3 className="mb-1.5 text-xl font-black tracking-tight text-slate-900">Cài đặt hồ sơ cá nhân</h3>
            <p className="mb-8 text-sm font-medium text-slate-500">
              Cập nhật thông tin chi tiết để peers/employers nhận dạng khi giao dịch.
            </p>

            {errorMsg && (
              <div className="mb-6 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-600">
                <span className="text-lg">⚠️</span> {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-600">
                <span className="text-lg">✓</span> {successMsg}
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-5">
              
              {/* School (Locked - Forced white background and slate-900 text color) */}
              <div>
                <label className={labelClassName}>
                  Trường Đại học (Khóa)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    disabled
                    value={profile.university || 'Đại học'}
                    className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3.5 text-sm font-black text-slate-900 outline-none cursor-not-allowed"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-slate-400">
                    Chỉ đọc
                  </span>
                </div>
              </div>

              {/* Major & Display Name Grid */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* Display Name */}
                <div>
                  <label htmlFor="display-name" className={labelClassName}>
                    Tên hiển thị
                  </label>
                  <input
                    id="display-name"
                    type="text"
                    required
                    placeholder="Nhập tên hiển thị của bạn"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isSubmitting}
                    className={inputClassName}
                  />
                </div>

                {/* Major */}
                <div>
                  <label htmlFor="major" className={labelClassName}>
                    Chuyên ngành học
                  </label>
                  <input
                    id="major"
                    type="text"
                    required
                    placeholder="Ví dụ: Khoa học máy tính"
                    value={major}
                    onChange={(e) => setMajor(e.target.value)}
                    disabled={isSubmitting}
                    className={inputClassName}
                  />
                </div>
              </div>

              {/* Bio description */}
              <div>
                <label htmlFor="bio" className={labelClassName}>
                  Giới thiệu bản thân
                </label>
                <textarea
                  id="bio"
                  rows={4}
                  placeholder="Chia sẻ ngắn gọn kinh nghiệm lập trình, thiết kế hoặc thế mạnh của bạn..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  disabled={isSubmitting}
                  className={`${inputClassName} resize-none`}
                />
              </div>

              {/* Social links Grid */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* Facebook URL */}
                <div>
                  <label htmlFor="facebook-link" className={labelClassName}>
                    Link Facebook cá nhân
                  </label>
                  <input
                    id="facebook-link"
                    type="url"
                    placeholder="https://facebook.com/username"
                    value={facebookUrl}
                    onChange={(e) => setFacebookUrl(e.target.value)}
                    disabled={isSubmitting}
                    className={inputClassName}
                  />
                </div>

                {/* Gmail URL */}
                <div>
                  <label htmlFor="gmail-link" className={labelClassName}>
                    Gmail cá nhân
                  </label>
                  <input
                    id="gmail-link"
                    type="email"
                    placeholder="yourname@gmail.com"
                    value={gmailUrl}
                    onChange={(e) => setGmailUrl(e.target.value)}
                    disabled={isSubmitting}
                    className={inputClassName}
                  />
                </div>
              </div>

              {/* Submit Save */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="relative mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-4 text-sm font-black text-white shadow-lg shadow-indigo-500/25 transition-all duration-200 hover:from-blue-500 hover:to-purple-500 hover:shadow-indigo-500/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    <span>Đang đồng bộ thay đổi...</span>
                  </>
                ) : (
                  'Lưu cài đặt hồ sơ'
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

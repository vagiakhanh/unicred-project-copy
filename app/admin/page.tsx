'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabaseClient';
import Navbar from '@/components/Navbar';
import Link from 'next/link';

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  university: string | null;
  major: string | null;
  credits: number;
  reputation: number;
  is_verified: boolean;
  role: 'user' | 'admin';
  is_banned: boolean;
  flagged_reason: string | null;
  student_card_url: string | null;
}

interface AdminJob {
  id: string;
  title: string;
  description: string | null;
  price: number;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  owner_id: string;
  assigned_worker_id: string | null;
  deadline: string | null;
  category: string;
  location: string | null;
  is_flagged: boolean;
  flagged_reason: string | null;
  created_at: string;
  payout_status: string | null;
  review_deadline: string | null;
}

interface AdminRating {
  id: string;
  job_id: string;
  rater_id: string;
  rated_user_id: string;
  stars: number;
  proof_image_url: string | null;
  created_at: string;
  comment?: string;
}

export default function AdminDashboard() {
  const { profile, loading: authLoading } = useAuth();

  // Các trạng thái lưu trữ dữ liệu quản trị
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [ratings, setRatings] = useState<AdminRating[]>([]);
  const [appeals, setAppeals] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Thanh điều hướng Tab: approvals | users | ai_moderation | disputes
  const [activeTab, setActiveTab] = useState<'approvals' | 'users' | 'ai_moderation' | 'disputes'>('approvals');

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Đồng bộ toàn bộ dữ liệu hệ thống về cổng Admin
  const loadAdminData = async () => {
    try {
      setLoadingData(true);
      setErrorMessage('');

      // 1. Tải toàn bộ thành viên
      const { data: usersData, error: usersErr } = await supabase
        .from('users')
        .select('*')
        .order('email', { ascending: true });
      if (usersErr) throw usersErr;

      // 2. Tải toàn bộ công việc
      const { data: jobsData, error: jobsErr } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });
      if (jobsErr) throw jobsErr;

      // 3. Tải toàn bộ lịch sử đánh giá uy tín
      const { data: ratingsData, error: ratingsErr } = await supabase
        .from('reputation_logs')
        .select('*')
        .order('created_at', { ascending: false });
      if (ratingsErr) throw ratingsErr;

      // 4. FIX LỖI TRANH CHẤP: Select liên kết bảng sang cả reputation_logs để lấy ảnh minh chứng
      const { data: appealsData, error: appealsErr } = await supabase
        .from('appeals')
        .select(`
          *,
          reputation_logs (
            stars,
            comment,
            proof_image_url
          )
        `)
        .order('created_at', { ascending: false });
      if (appealsErr) throw appealsErr;

      setUsers((usersData as AdminUser[]) || []);
      setJobs((jobsData as AdminJob[]) || []);
      setRatings((ratingsData as AdminRating[]) || []);
      setAppeals(appealsData || []);
    } catch (err: any) {
      console.error('[Admin Fetch Error]:', err);
      setErrorMessage(err.message || 'Lỗi hệ thống khi tải cơ sở dữ liệu Admin.');
    } finally {
      // 🛠️ FIX LỖI 1: Sửa fillv thành finally chuẩn cấu pháp JavaScript
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (profile && profile.role === 'admin') {
      loadAdminData();
    }
  }, [profile]);

  const setSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  const setError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(''), 4000);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span className="text-xs text-text-muted">Đang xác thực quyền Admin...</span>
        </div>
      </div>
    );
  }

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-3xl font-black mb-4">
            🛑
          </div>
          <h1 className="text-2xl font-black text-foreground mb-2">Từ chối truy cập!</h1>
          <p className="text-xs text-text-muted mb-6"> Khu vực tối cao chỉ dành cho Admin UniCred.</p>
          <Link href="/" className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-md transition-all">
            Quay về trang chủ
          </Link>
        </main>
      </div>
    );
  }

  const handleApproveStudent = async (userId: string) => {
    setActionLoading(`approve-${userId}`);
    try {
      const { error } = await supabase.from('users').update({ is_verified: true, flagged_reason: null }).eq('id', userId);
      if (error) throw error;
      setSuccess('Đã phê duyệt thẻ sinh viên thành công!');
      await loadAdminData();
    } catch (err: any) { setError(err.message); } finally { setActionLoading(null); }
  };

  const handleDeclineStudent = async (userId: string) => {
    setActionLoading(`decline-${userId}`);
    try {
      const { error } = await supabase.from('users').update({ student_card_url: null, is_verified: false, flagged_reason: 'Ảnh thẻ sinh viên không rõ ràng. Vui lòng tải lại.' }).eq('id', userId);
      if (error) throw error;
      setSuccess('Đã từ chối ảnh thẻ sinh viên.');
      await loadAdminData();
    } catch (err: any) { setError(err.message); } finally { setActionLoading(null); }
  };

  const handleToggleBanUser = async (userId: string, currentBanStatus: boolean) => {
    setActionLoading(`ban-${userId}`);
    try {
      const { error } = await supabase.from('users').update({ is_banned: !currentBanStatus }).eq('id', userId);
      if (error) throw error;
      setSuccess(currentBanStatus ? 'Đã mở khóa tài khoản!' : 'Đã khóa tài khoản thành viên!');
      await loadAdminData();
    } catch (err: any) { setError(err.message); } finally { setActionLoading(null); }
  };

  const handleDismissJobFlag = async (jobId: string) => {
    setActionLoading(`dismiss-job-${jobId}`);
    try {
      const { error } = await supabase.from('jobs').update({ is_flagged: false, flagged_reason: null }).eq('id', jobId);
      if (error) throw error;
      setSuccess('Đã gỡ cờ cảnh báo công việc!');
      await loadAdminData();
    } catch (err: any) { setError(err.message); } finally { setActionLoading(null); }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa vĩnh viễn bài đăng tuyển dụng này không?')) return;
    setActionLoading(`delete-job-${jobId}`);
    try {
      const { error } = await supabase.from('jobs').delete().eq('id', jobId);
      if (error) throw error;
      setSuccess('Đã xóa vĩnh viễn tin tuyển dụng vi phạm!');
      await loadAdminData();
    } catch (err: any) { setError(err.message); } finally { setActionLoading(null); }
  };

  const handleDisputeFavorWorker = async (jobId: string, employerId: string, appealId: string) => {
    if (!confirm('Xác nhận phán quyết: Thợ làm tốt. Trả lại cọc 20 credits và +10 thưởng cho Người thuê?')) return;
    setActionLoading(`dispute-favor-${jobId}`);
    try {
      const targetUser = users.find(u => u.id === employerId);
      const currentCredits = targetUser ? targetUser.credits : 0;

      const { error: walletError } = await supabase
        .from('users')
        .update({ credits: currentCredits + 30 })
        .eq('id', employerId);
      if (walletError) throw walletError;

      await supabase.from('jobs').update({ payout_status: 'released' }).eq('id', jobId);
      await supabase.from('appeals').update({ status: 'Finalized', admin_comment: 'Thợ làm tốt: Hoàn cọc & Thưởng' }).eq('id', appealId);

      setSuccess('Phán quyết thành công! Đã hoàn cọc và cộng thưởng cho Người thuê.');
      await loadAdminData();
    } catch (err: any) { setError(err.message); } finally { setActionLoading(null); }
  };

  const handleDisputePenalizeWorker = async (jobId: string, employerId: string, appealId: string) => {
    if (!confirm('Xác nhận phán quyết: Thợ làm không tốt. Tịch thu toàn bộ 20 credits cọc của Người thuê?')) return;
    setActionLoading(`dispute-penalize-${jobId}`);
    try {
      await supabase.from('jobs').update({ payout_status: 'penalized' }).eq('id', jobId);
      await supabase.from('appeals').update({ status: 'Finalized', admin_comment: 'Thợ làm không tốt: Tịch thu tiền cọc' }).eq('id', appealId);

      setSuccess('Phán quyết thành công! 20 credits cọc của người thuê đã bị tịch thu.');
      await loadAdminData();
    } catch (err: any) { setError(err.message); } finally { setActionLoading(null); }
  };

  const pendingApprovals = users.filter(u => !u.is_verified && u.student_card_url);
  const flaggedJobs = jobs.filter(j => j.is_flagged);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        
        {successMessage && (
          <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3.5 shadow-2xl text-sm font-bold text-emerald-600 dark:text-emerald-400">
              <span>✓</span><span>{successMessage}</span>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
            <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-5 py-3.5 shadow-2xl text-sm font-bold text-rose-600 dark:text-rose-400">
              <span>⚠️</span><span>{errorMessage}</span>
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-border-color mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">Bảng quản trị Admin</h1>
            <p className="text-xs text-text-muted mt-1">Cổng kiểm soát dòng tiền, xác minh thẻ học viên và xử lý tranh chấp Escrow.</p>
          </div>
          <button onClick={loadAdminData} disabled={loadingData} className="flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-900 border px-4 py-2.5 text-xs font-bold cursor-pointer hover:text-indigo-600 transition-all">
            {loadingData ? 'Đang tải...' : '🔄 Làm mới dữ liệu'}
          </button>
        </div>

        <div className="flex border-b border-border-color mb-8 gap-1.5 overflow-x-auto pb-1.5">
          <button onClick={() => setActiveTab('approvals')} className={`rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${activeTab === 'approvals' ? 'bg-indigo-600 text-white shadow-md' : 'text-text-muted hover:text-foreground'}`}>
            📋 Phê duyệt sinh viên ({pendingApprovals.length})
          </button>
          <button onClick={() => setActiveTab('users')} className={`rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-md' : 'text-text-muted hover:text-foreground'}`}>
            👥 Quản lý thành viên ({users.length})
          </button>
          <button onClick={() => setActiveTab('ai_moderation')} className={`rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${activeTab === 'ai_moderation' ? 'bg-indigo-600 text-white shadow-md' : 'text-text-muted hover:text-foreground'}`}>
            🤖 Bộ lọc nghi ngờ ({flaggedJobs.length})
          </button>
          <button onClick={() => setActiveTab('disputes')} className={`rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${activeTab === 'disputes' ? 'bg-indigo-600 text-white shadow-md' : 'text-text-muted hover:text-foreground'}`}>
            ⚖️ Khiếu nại & Tranh chấp ({appeals.length})
          </button>
        </div>

        {loadingData ? (
          <div className="py-16 text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent mx-auto mb-3" />
            <span className="text-xs text-text-muted">Đang kết nối trung tâm dữ liệu...</span>
          </div>
        ) : (
          <div>
            {activeTab === 'approvals' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pendingApprovals.length === 0 ? (
                  <div className="py-12 text-center text-text-muted text-xs col-span-2">Không có thẻ sinh viên nào đang chờ phê duyệt.</div>
                ) : (
                  pendingApprovals.map((std) => (
                    <div key={std.id} className="rounded-2xl border bg-card-bg p-5 flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-foreground">{std.name || 'Chưa cập nhật tên'}</h3>
                        <p className="text-xs text-text-muted mb-3">{std.email}</p>
                        <img src={std.student_card_url || ''} className="w-full h-48 object-contain rounded-xl bg-slate-900 border mb-4" alt="Thẻ sinh viên" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleApproveStudent(std.id)} className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold cursor-pointer">Phê duyệt cấp quyền</button>
                        <button onClick={() => handleDeclineStudent(std.id)} className="py-2 px-4 bg-rose-500/10 text-rose-600 rounded-xl text-xs font-bold cursor-pointer">Từ chối ảnh</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'users' && (
              <div className="rounded-2xl border bg-card-bg overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b text-text-muted font-bold">
                      <th className="p-4">Họ và tên / Email</th>
                      <th className="p-4">Trường đại học</th>
                      <th className="p-4 text-right">Ví số dư Credits</th>
                      <th className="p-4 text-center">Trạng thái quyền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/40">
                        <td className="p-4 font-bold">{u.name || u.email}</td>
                        <td className="p-4 text-text-muted">{u.university || 'Chưa cập nhật'}</td>
                        <td className="p-4 text-right font-black text-indigo-600 dark:text-indigo-400">{u.credits}</td>
                        <td className="p-4 text-center">
                          <button onClick={() => handleToggleBanUser(u.id, u.is_banned)} className={`rounded-lg px-2 py-1 font-bold ${u.is_banned ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                            {u.is_banned ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'ai_moderation' && (
              <div className="space-y-4">
                {flaggedJobs.length === 0 ? (
                  <div className="py-12 text-center text-text-muted text-xs">Không có tin tuyển dụng nào bị cảnh báo vi phạm.</div>
                ) : (
                  flaggedJobs.map((jb) => (
                    <div key={jb.id} className="rounded-2xl border border-rose-500/25 bg-card-bg p-5">
                      <h4 className="text-sm font-black text-rose-600">{jb.title}</h4>
                      <p className="text-xs text-text-muted my-2">🚨 Lý do gắn cờ ẩn: {jb.flagged_reason || 'Nghi ngờ nội dung vi phạm tiêu chuẩn.'}</p>
                      <div className="flex gap-2 mt-4">
                        <button onClick={() => handleDismissJobFlag(jb.id)} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-xs font-bold rounded-lg cursor-pointer">Bỏ qua & Gỡ cờ</button>
                        <button onClick={() => handleDeleteJob(jb.id)} className="px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-lg cursor-pointer">Xóa bài vĩnh viễn</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'disputes' && (
              <div className="space-y-4">
                {appeals.length === 0 ? (
                  <div className="py-12 text-center text-text-muted text-xs">Hệ thống trong sạch. Không có khiếu nại tranh chấp cọc nào đang diễn ra.</div>
                ) : (
                  appeals.map((app) => {
                    // 🛠️ FIX LỖI 2: Sửa app.reputation_log thành reputation_logs tương thích với select query liên kết bảng của bạn
                    const currentJob = jobs.find(j => j.id === app.reputation_logs?.job_id);
                    
                    const isPending = app.status === 'Disputed_Frozen' || app.status === 'pending';
                    const targetJobId = app.job_id || currentJob?.id || '';
                    const targetEmployerId = currentJob?.owner_id || app.user_id || '';

                    const proofImgUrl = app.reputation_logs?.proof_image_url || app.proof_image_url;

                    return (
                      <div key={app.id} className="rounded-2xl border bg-card-bg p-5 flex flex-col md:flex-row gap-6 border-l-4 border-l-indigo-500">
                        <div className="flex-1 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[10px] uppercase font-black tracking-wider text-text-muted block">Mã đơn khiếu nại: #{app.id.substring(0, 8)}</span>
                              <h4 className="text-sm font-bold text-foreground mt-1">Nội dung hệ thống ghi nhận tự động:</h4>
                            </div>
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${isPending ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-slate-100 text-text-muted'}`}>
                              {isPending ? '⚖️ Tranh chấp đóng băng cọc' : '✓ Đã hoàn tất phân xử'}
                            </span>
                          </div>

                          <div className="bg-slate-50 dark:bg-slate-900 border rounded-xl p-3.5 text-xs">
                            <p className="text-foreground leading-relaxed">
                              "{app.reason || `Hệ thống tự động khóa bảo chứng công việc mã số #${targetJobId.substring(0, 8)}`}"
                            </p>
                          </div>

                          {/* HIỂN THỊ HÌNH ẢNH MINH CHỨNG TRỰC QUAN TRÊN CỔNG KIỂM SOÁT ADMIN */}
                          {proofImgUrl ? (
                            <div className="mt-3 p-3 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                              <p className="text-[11px] font-black text-slate-500 dark:text-slate-400 mb-2">📸 Hình ảnh minh chứng đính kèm từ người nộp:</p>
                              <div className="relative max-w-xs overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-950">
                                <img 
                                  src={proofImgUrl} 
                                  alt="Minh chứng tranh chấp" 
                                  className="w-full h-auto max-h-48 object-cover hover:scale-105 transition-transform duration-200 cursor-zoom-in"
                                  onClick={() => window.open(proofImgUrl, '_blank')}
                                  title="Click để phóng to ảnh sang tab mới"
                                />
                                <div className="p-1.5 bg-slate-50 dark:bg-slate-900 text-center border-t border-slate-200 dark:border-slate-800">
                                  <a 
                                    href={proofImgUrl} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline"
                                  >
                                    🔍 Xem ảnh kích thước đầy đủ
                                  </a>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-[10px] text-amber-600 dark:text-amber-400 italic font-medium">
                              ⚠️ Ca khiếu nại này không kèm hình ảnh minh chứng đính kèm.
                            </div>
                          )}
                        </div>

                        <div className="w-full md:w-72 flex flex-col justify-between border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-5">
                          <div className="bg-slate-50 dark:bg-slate-900 border rounded-xl p-3.5 text-xs text-left mb-4">
                            <span className="block text-[10px] font-black text-text-muted tracking-wider mb-2">THÔNG TIN BẢO CHỨNG GIAO DỊCH</span>
                            <p className="text-foreground font-bold truncate">
                              Công việc: {currentJob ? currentJob.title : `ID công việc: #${targetJobId.substring(0, 8)}`}
                            </p>
                            <p className="text-rose-500 font-extrabold mt-1">Cọc bảo chứng bị giữ: 20 Credits</p>
                          </div>

                          {isPending && targetJobId && (
                            <div className="space-y-2">
                              <button
                                onClick={() => handleDisputeFavorWorker(targetJobId, targetEmployerId, app.id)}
                                className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm cursor-pointer transition-all active:scale-95"
                              >
                                ✓ Thợ làm tốt (Hoàn cọc + Thưởng 10)
                              </button>
                              <button
                                onClick={() => handleDisputePenalizeWorker(targetJobId, targetEmployerId, app.id)}
                                className="w-full py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-sm cursor-pointer transition-all active:scale-95"
                              >
                                ✕ Thợ không tốt (Tịch thu 20 cọc)
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
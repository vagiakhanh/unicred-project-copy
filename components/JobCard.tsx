'use client';

import React, { useState } from 'react';
import { formatDateVN } from '@/lib/vietnamTime';

export interface Job {
  id: string;
  title: string;
  description: string;
  price: number;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  owner_id: string;
  assigned_worker_id?: string | null;
  client_approved?: boolean;
  worker_approved?: boolean;
  deadline?: string;
  category: string;
  location?: string;
  created_at?: string;
  is_flagged?: boolean;
  review_deadline?: string | null;
  payout_status?: string | null;
  owner?: {
    email: string;
    name?: string;
    is_verified?: boolean;
    client_reputation?: number;
    freelancer_reputation?: number;
    reputation?: number;
  };
}

export interface Application {
  id: string;
  job_id: string;
  user_id: string;
  created_at: string;
  user?: {
    email: string;
    name?: string;
    freelancer_reputation?: number;
    reputation?: number;
    university?: string;
  };
}

export interface Contract {
  id: string;
  job_id: string;
  worker_id: string;
  status: 'active' | 'completed';
  worker?: {
    email: string;
    name?: string;
    freelancer_reputation?: number;
    reputation?: number;
  };
}

interface JobCardProps {
  job: Job;
  activeUserId: string;
  activeView: 'hire' | 'earn';
  applications: Application[];
  applied: boolean;
  contract: Contract | null;
  onApply: (jobId: string) => Promise<void>;
  onAcceptApplicant: (jobId: string, workerId: string) => Promise<void>;
  onCompleteClick: (jobId: string, workerId: string) => void;
  onOpenChat: (jobId: string, workerId: string, otherName: string, jobTitle: string) => void;
  onApproveCompletion?: (jobId: string, role: 'client' | 'worker') => Promise<void>;
  onOpenAppealModal?: (ratingId: string, jobTitle: string) => void;
  onOpenReviewModal?: (jobId: string, ratedUserId: string, jobTitle: string) => void;
  jobReviews?: any[];
  userAppeals?: any[];
  onWithdrawApplication?: (jobId: string) => Promise<void>;
  onDeleteJob?: (jobId: string) => Promise<void>;
  onDeleteReview?: (reviewId: string) => Promise<void>;
  onViewProfile?: (userId: string, roleLabel: string) => void;
}

const CATEGORY_MAP: Record<string, string> = {
  coding: '💻 Lập trình',
  design: '🎨 Thiết kế',
  writing: '✍️ Content',
  translation: '🌐 Dịch thuật',
  video: '🎥 Media',
  others: '⚙️ Việc khác',
};

export default function JobCard({
  job,
  activeUserId,
  activeView,
  applications = [],
  applied = false,
  contract = null,
  onApply,
  onAcceptApplicant,
  onCompleteClick,
  onOpenChat,
  onApproveCompletion,
  onOpenAppealModal,
  onOpenReviewModal,
  jobReviews = [],
  userAppeals = [],
  onWithdrawApplication,
  onDeleteJob,
  onDeleteReview,
  onViewProfile,
}: JobCardProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const handleApply = async () => {
    setLoadingAction('apply');
    try {
      await onApply(job.id);
    } catch (err) {
      console.error(err);
    } fillv: {
      setLoadingAction(null);
    }
  };

  const handleAccept = async (workerId: string) => {
    setLoadingAction(`accept-${workerId}`);
    try {
      await onAcceptApplicant(job.id, workerId);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAction(null);
    }
  };

  // 🛠️ SỬA LỖI 1: Thay thế từ khóa lỗi fillv thành finally chuẩn JavaScript
  const handleApproveClick = async (role: 'client' | 'worker') => {
    setLoadingAction(`approve-${role}`);
    try {
      if (onApproveCompletion) {
        await onApproveCompletion(job.id, role);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleWithdraw = async () => {
    setConfirmAction(null);
    setLoadingAction('withdraw');
    try {
      if (onWithdrawApplication) await onWithdrawApplication(job.id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDelete = async () => {
    setConfirmAction(null);
    setLoadingAction('delete');
    try {
      if (onDeleteJob) await onDeleteJob(job.id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAction(null);
    }
  };

  // Trích xuất điểm uy tín
  const ownerRep = job.owner?.client_reputation ?? job.owner?.reputation ?? 100;
  const isOwnerHighRisk = ownerRep < 40;

  const workerRep = contract?.worker?.freelancer_reputation ?? contract?.worker?.reputation ?? 100;
  const isWorkerHighRisk = workerRep < 40;

  // Tính toán log đánh giá từ hai đầu người dùng
  const clientReview = jobReviews.find(r => r.job_id === job.id && r.rater_id === job.owner_id);
  const workerReview = jobReviews.find(r => r.job_id === job.id && r.rater_id === job.assigned_worker_id);

  const myReview = activeUserId === job.owner_id ? clientReview : workerReview;
  const partnerReview = activeUserId === job.owner_id ? workerReview : clientReview;

  const myAppeal = partnerReview ? userAppeals.find(a => a.reputation_log_id === partnerReview.id) : null;

  const isWithin72Hours = (createdAtString?: string) => {
    if (!createdAtString) return false;
    const createdDate = new Date(createdAtString);
    const limitDate = new Date(createdDate.getTime() + 72 * 60 * 60 * 1000);
    return new Date() < limitDate;
  };

  const getCountdownText = (deadlineStr?: string | null): string => {
    if (!deadlineStr) return '';
    const diff = new Date(deadlineStr).getTime() - Date.now();
    if (diff <= 0) return 'Đã hết hạn đánh giá';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days} ngày ${hours} giờ`;
    return `${hours} giờ ${mins} phút`;
  };

  return (
    <div className="group relative flex flex-col justify-between h-full rounded-2xl border border-border-color bg-card-bg p-6 shadow-card transition-all duration-300 hover:border-indigo-500/30 hover:shadow-md">
      <div>
        <div className="flex items-center justify-between gap-4 mb-3">
          {job.status === 'open' && activeView === 'earn' && applied ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              Đã ứng tuyển
            </span>
          ) : job.status === 'open' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Đang tuyển
            </span>
          ) : null}
          {job.status === 'in_progress' && activeView === 'earn' && job.assigned_worker_id === activeUserId ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Đã nhận việc
            </span>
          ) : job.status === 'in_progress' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
              Đang làm việc
            </span>
          ) : null}
          {job.status === 'completed' && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/20 bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-600 dark:text-purple-400">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                Đã báo cáo xong
              </span>
              {(!job.payout_status || job.payout_status === 'escrow') && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 animate-pulse">
                  🔒 Giam bảo chứng (Escrow)
                </span>
              )}
              {job.payout_status === 'released' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  ✓ Đã giải ngân thành công
                </span>
              )}
              {job.payout_status === 'penalized' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                  ✕ Tịch thu cọc bảo chứng
                </span>
              )}
              {job.payout_status === 'disputed' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                  ⚖ Tranh chấp chờ Admin
                </span>
              )}
            </div>
          )}
          {job.status === 'cancelled' && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              Đã hủy bỏ
            </span>
          )}

          <div className="flex items-baseline gap-0.5">
            <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
              {job.price.toLocaleString('vi-VN')}đ
            </span>
          </div>
        </div>

        <h3 className="text-lg font-bold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors duration-200 line-clamp-1 mb-1">
          {job.title}
        </h3>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="rounded bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-500 dark:text-indigo-400">
            {CATEGORY_MAP[job.category] || '⚙️ Khác'}
          </span>
          <span className="rounded bg-slate-500/10 border border-slate-500/20 px-2 py-0.5 text-[10px] font-bold text-text-muted">
            📍 {job.location || 'Online'}
          </span>
          {activeView === 'earn' && isOwnerHighRisk && (
            <span className="rounded bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-600 animate-pulse">
              ⚠️ Tài khoản rủi ro cao
            </span>
          )}
        </div>

        <p className="text-sm text-text-muted leading-relaxed mb-4 line-clamp-3">
          {job.description || 'Không có mô tả công việc.'}
        </p>

        <div className="grid grid-cols-2 gap-2 text-xs text-text-muted bg-background border border-border-color rounded-xl p-3 mb-4">
          <div>
            <span className="block text-[10px] text-text-muted font-bold uppercase tracking-wider mb-0.5">
              Đăng bởi
            </span>
            <span className="font-semibold text-foreground truncate block flex items-center gap-1">
              👤{' '}
              {onViewProfile ? (
                <button
                  onClick={() => onViewProfile(job.owner_id, 'Người đăng bài')}
                  className="hover:underline text-indigo-600 font-bold text-left cursor-pointer transition-colors border-0 bg-transparent p-0"
                >
                  {job.owner?.name || job.owner?.email?.split('@')[0] || 'Khách'}
                </button>
              ) : (
                job.owner?.name || job.owner?.email?.split('@')[0] || 'Khách'
              )}
              {job.owner?.is_verified && (
                <span className="text-[10px] text-blue-600 dark:text-blue-400" title="Sinh viên đã xác thực">✓</span>
              )}
            </span>
            <span className="text-[10px] text-text-muted font-medium block mt-0.5">
              ⭐ Uy tín: {ownerRep}/100
            </span>
          </div>
          <div>
            <span className="block text-[10px] text-text-muted font-bold uppercase tracking-wider mb-0.5">
              Hạn hoàn thành
            </span>
            {/* 🛠️ SỬA LỖI 2: Thêm toán tử fallback ?? '' để ngăn chặn lỗi biên dịch undefined của Typescript */}
            <span className="font-semibold text-rose-500 flex items-center gap-1">
              📅 {formatDateVN(job.deadline ?? '')}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-border-color">
        
        {/* ======================================================== */}
        {/* EMPLOYER VIEW: HIRE OPTIONS                              */}
        {/* ======================================================== */}
        {activeView === 'hire' && (
          <div className="space-y-4">
            {job.status === 'open' && (
              <div>
                <span className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                  Danh sách ứng tuyển ({applications.length})
                </span>
                
                {applications.length === 0 ? (
                  <p className="text-xs text-text-muted italic py-1">Chưa có sinh viên ứng tuyển...</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {applications.map((app) => {
                      const appRep = app.user?.freelancer_reputation ?? app.user?.reputation ?? 100;
                      const appIsHighRisk = appRep < 40;

                      return (
                        <div key={app.id} className="flex items-center justify-between gap-3 bg-background border border-border-color rounded-xl p-2.5 shadow-sm">
                          <div className="min-w-0 flex-1">
                            <span className="block text-xs font-bold text-foreground truncate flex items-center gap-1">
                              {app.user?.name || app.user?.email || 'Sinh Viên'}
                              {appIsHighRisk && (
                                <span className="text-[9px] font-bold text-rose-500 bg-rose-50 px-1 rounded border border-rose-200">⚠️ Rủi ro</span>
                              )}
                            </span>
                            <span className="block text-[9px] text-text-muted font-medium truncate">
                              🏫 {app.user?.university || 'Trường Đại học'}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 font-bold mt-0.5">
                              ⭐ Uy tín: {appRep}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => onOpenChat(job.id, app.user_id, app.user?.name || app.user?.email || 'Sinh Viên', job.title)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center border border-slate-200"
                              title="Nhắn tin trò chuyện"
                            >
                              💬
                            </button>
                            <button
                              onClick={() => handleAccept(app.user_id)}
                              disabled={loadingAction !== null}
                              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[10px] font-bold text-white px-3 py-1.5 rounded-lg active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                            >
                              {loadingAction === `accept-${app.user_id}` ? (
                                <div className="h-3 w-3 animate-spin rounded-full border border-t-transparent border-white" />
                              ) : (
                                'Xác nhận'
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {job.status === 'open' && job.owner_id === activeUserId && onDeleteJob && (
              <div className="mt-3">
                {confirmAction === `delete-${job.id}` ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-rose-400/30 bg-rose-500/5 p-3">
                    <p className="text-xs font-bold text-rose-600 text-center">
                      ⚠️ Bạn có chắc chắn muốn xóa bài đăng này không?
                    </p>
                    <p className="text-[10px] text-rose-500 text-center">Hành động này không thể hoàn tác.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmAction(null)}
                        className="flex-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold py-1.5 hover:bg-slate-50 transition-all cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={loadingAction === 'delete'}
                        className="flex-1 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold py-1.5 transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        {loadingAction === 'delete' ? (
                          <div className="h-3 w-3 animate-spin rounded-full border border-t-transparent border-white" />
                        ) : (
                          'Xóa bài đăng'
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmAction(`delete-${job.id}`)}
                    disabled={loadingAction !== null}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-rose-400/30 bg-rose-500/5 hover:bg-rose-500/10 text-rose-600 text-xs font-bold py-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    🗑️ Xóa bài đăng
                  </button>
                )}
              </div>
            )}

            {job.status === 'in_progress' && (
              <div className="space-y-3">
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs flex justify-between items-center">
                  <div className="min-w-0">
                    <span className="block text-[10px] uppercase text-text-muted font-bold mb-1">Người làm việc</span>
                    <span className="font-bold text-foreground block truncate flex items-center gap-1">
                      👤{' '}
                      {onViewProfile && (contract?.worker_id || job.assigned_worker_id) ? (
                        <button
                          onClick={() => onViewProfile((contract?.worker_id || job.assigned_worker_id)!, 'Người nhận việc')}
                          className="hover:underline text-indigo-600 font-bold text-left cursor-pointer transition-colors border-0 bg-transparent p-0"
                        >
                          {contract?.worker?.name || contract?.worker?.email || 'Freelancer'}
                        </button>
                      ) : (
                        contract?.worker?.name || contract?.worker?.email || 'Freelancer'
                      )}
                      {isWorkerHighRisk && (
                        <span className="text-[9px] font-bold text-rose-500 bg-rose-50 px-1.5 rounded border border-rose-200">⚠️ Rủi ro cao</span>
                      )}
                    </span>
                    <span className="block text-[9px] text-text-muted mt-0.5">⭐ Uy tín: {workerRep}/100</span>
                  </div>
                  <button
                    onClick={() => {
                      const wId = contract?.worker_id || job.assigned_worker_id || '';
                      const appMatch = applications.find((a) => a.user_id === wId);
                      const wName = contract?.worker?.name || contract?.worker?.email?.split('@')[0] || appMatch?.user?.name || 'Người nhận việc';
                      onOpenChat(job.id, wId, wName, job.title);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                  >
                    💬 Nhắn tin
                  </button>
                </div>

                <div className="text-[11px] bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Đối tác (Freelancer) hoàn thành:</span>
                    <span className={`font-bold ${job.worker_approved ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {job.worker_approved ? '✓ Đã báo cáo' : '⏳ Chưa báo cáo'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Chủ việc (Bạn) duyệt:</span>
                    <span className={`font-bold ${job.client_approved ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {job.client_approved ? '✓ Đã duyệt' : '⏳ Chưa duyệt'}
                    </span>
                  </div>
                </div>

                {!job.client_approved ? (
                  <button
                    onClick={() => handleApproveClick('client')}
                    disabled={loadingAction !== null}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:from-emerald-500 hover:to-teal-500 transition-all cursor-pointer shadow-md disabled:opacity-50"
                  >
                    {loadingAction === 'approve-client' ? (
                      <div className="h-4 w-4 animate-spin rounded-full border border-t-transparent border-white" />
                    ) : (
                      '✔️ Xác nhận hoàn thành (Duyệt)'
                    )}
                  </button>
                ) : (
                  <div className="text-center text-xs font-bold text-emerald-600 py-1">
                    Bạn đã duyệt hoàn thành. Chờ freelancer xác nhận.
                  </div>
                )}
              </div>
            )}

            {/* ĐÁNH GIÁ PHẦN EMPLOYER */}
            {job.status === 'completed' && (
              <div className="space-y-3">
                {job.payout_status === 'disputed' ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5 justify-center text-center animate-pulse">
                    ⚖️ Có đánh giá tiêu cực. Tiền cọc đã đóng băng trên khố Admin chờ phân xử.
                  </div>
                ) : job.payout_status === 'released' ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3.5 justify-center text-center">
                    🎉 Luồng bảo chứng thành công! Hoàn 20 cọc và cộng 10 credits thưởng.
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 justify-center text-center animate-pulse">
                    🔒 Cọc đang giữ bảo chứng. Hệ thống yêu cầu CẢ HAI BÊN tiến hành đánh giá để tự động xử lý.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2">
                  {!myReview && job.payout_status !== 'released' && job.payout_status !== 'penalized' && (
                    <button
                      onClick={() => onOpenReviewModal && onOpenReviewModal(job.id, job.assigned_worker_id || '', job.title)}
                      className="w-full text-center text-xs font-black bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl py-2.5 hover:opacity-90 shadow-md transition-all cursor-pointer"
                    >
                      ⭐ Tiến hành viết đánh giá nghiệm thu công việc
                    </button>
                  )}

                  {myReview && (
                    <div className="text-center text-xs text-text-muted bg-slate-50 border rounded-xl py-2.5 flex items-center justify-between px-3">
                      <span className="font-bold text-slate-700">✓ Bạn đã gửi đánh giá Freelancer: {myReview.stars} ⭐</span>
                      {onDeleteReview && (
                        <button
                          onClick={() => confirm('Bạn có chắc chắn muốn gỡ bỏ đánh giá này?') && onDeleteReview(myReview.id)}
                          className="text-[10px] font-bold text-rose-500 hover:underline border-0 bg-transparent cursor-pointer"
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  )}

                  {partnerReview && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-left">
                      <p className="font-bold text-foreground mb-1">
                        Freelancer đã đánh giá bạn: {partnerReview.stars} ⭐
                      </p>
                      {partnerReview.comment && (
                        <p className="text-text-muted italic">" {partnerReview.comment} "</p>
                      )}
                      {partnerReview.stars <= 2 && !myAppeal && isWithin72Hours(partnerReview.created_at) && onOpenAppealModal && (
                        <button
                          onClick={() => onOpenAppealModal(partnerReview.id, job.title)}
                          className="mt-2 text-rose-500 font-bold hover:underline cursor-pointer text-[11px] border-0 bg-transparent block p-0"
                        >
                          ⚖️ Khiếu nại điểm phạt (SLA 72h)
                        </button>
                      )}
                      {myAppeal && (
                        <div className="mt-2 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 inline-block">
                          Trạng thái khiếu nại: {myAppeal.status === 'Disputed_Frozen' ? 'Đang chờ Admin xử lý' : 'Đã kết thúc'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {job.status === 'cancelled' && (
              <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5 justify-center">
                Công việc đã bị hủy bỏ.
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* FREELANCER VIEW: EARN OPTIONS                            */}
        {/* ======================================================== */}
        {activeView === 'earn' && (
          <div>
            {job.status === 'open' && (
              <>
                {applied ? (
                  <div className="flex flex-col gap-2">
                    {confirmAction === `withdraw-${job.id}` ? (
                      <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-3 space-y-2">
                        <p className="text-xs font-bold text-amber-700 text-center">
                          Bạn muốn rút đơn ứng tuyển khỏi công việc này?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setConfirmAction(null)}
                            className="flex-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold py-1.5 hover:bg-slate-50 transition-all cursor-pointer"
                          >
                            Không, giữ lại
                          </button>
                          <button
                            onClick={handleWithdraw}
                            disabled={loadingAction === 'withdraw'}
                            className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-xs font-bold py-1.5 transition-all cursor-pointer flex items-center justify-center gap-1"
                          >
                            {loadingAction === 'withdraw' ? (
                              <div className="h-3 w-3 animate-spin rounded-full border border-t-transparent border-white" />
                            ) : (
                              'Rút đơn'
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmAction(`withdraw-${job.id}`)}
                          disabled={loadingAction !== null}
                          className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-2.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-rose-500/10 hover:border-rose-400/30 hover:text-rose-600 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Đã ứng tuyển
                        </button>
                        <button
                          onClick={() => onOpenChat(job.id, activeUserId, job.owner?.name || job.owner?.email?.split('@')[0] || 'Nhà tuyển dụng', job.title)}
                          className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                        >
                          💬 Nhắn tin
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={handleApply}
                    disabled={loadingAction !== null || job.owner_id === activeUserId}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:from-blue-500 hover:to-indigo-500 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-md"
                  >
                    {loadingAction === 'apply' ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border border-t-transparent border-white" />
                        Đang ứng tuyển...
                      </>
                    ) : job.owner_id === activeUserId ? (
                      'Bài đăng của bạn'
                    ) : (
                      'Ứng tuyển — ' + job.price.toLocaleString('vi-VN') + 'đ'
                    )}
                  </button>
                )}
              </>
            )}

            {job.status === 'in_progress' && (
              <>
                {job.assigned_worker_id === activeUserId ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 justify-center">
                      <span className="h-2 w-2 rounded-full bg-amber-600 dark:bg-amber-400 animate-pulse" />
                      Bạn đã được giao việc! Hãy hoàn thành đúng tiến độ.
                    </div>

                    <div className="text-[11px] bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-text-muted">Bạn (Freelancer) báo cáo hoàn thành:</span>
                        <span className={`font-bold ${job.worker_approved ? 'text-emerald-600' : 'text-slate-500'}`}>
                          {job.worker_approved ? '✓ Đã báo cáo' : '⏳ Chưa báo cáo'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Nhà tuyển dụng duyệt:</span>
                        <span className={`font-bold ${job.client_approved ? 'text-emerald-600' : 'text-slate-500'}`}>
                          {job.client_approved ? '✓ Đã duyệt' : '⏳ Chưa duyệt'}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {!job.worker_approved ? (
                        <button
                          onClick={() => handleApproveClick('worker')}
                          disabled={loadingAction !== null}
                          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-bold text-white hover:from-emerald-500 hover:to-teal-500 transition-all cursor-pointer shadow-md disabled:opacity-50"
                        >
                          {loadingAction === 'approve-worker' ? (
                            <div className="h-3 w-3 animate-spin rounded-full border border-t-transparent border-white" />
                          ) : (
                            '✔️ Báo cáo đã hoàn thành'
                          )}
                        </button>
                      ) : (
                        <div className="flex-1 text-center text-xs font-bold text-emerald-600 py-2.5 bg-emerald-50 border border-emerald-250 rounded-xl">
                          Bạn đã báo cáo hoàn thành. Chờ đối tác duyệt.
                        </div>
                      )}
                      <button
                        onClick={() => onOpenChat(job.id, activeUserId, job.owner?.name || job.owner?.email?.split('@')[0] || 'Nhà tuyển dụng', job.title)}
                        className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                      >
                        💬 Chat
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    disabled
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-border-color bg-slate-100 dark:bg-slate-900 px-4 py-2.5 text-sm font-bold text-text-muted cursor-not-allowed"
                  >
                    Đã có người nhận việc
                  </button>
                )}
              </>
            )}

            {/* ĐÁNH GIÁ PHẦN FREELANCER */}
            {job.status === 'completed' && (
              <div className="space-y-3">
                {job.payout_status === 'disputed' ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5 justify-center text-center animate-pulse">
                    ⚖️ Có đánh giá tiêu cực. Tiền cọc đã đóng băng trên khố Admin chờ phân xử.
                  </div>
                ) : job.payout_status === 'released' ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3.5 justify-center text-center">
                    🎉 Luồng bảo chứng thành công! Đối tác đã nhận lương hoàn tất.
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 justify-center text-center animate-pulse">
                    🔒 Cọc đang giữ bảo chứng. Hệ thống yêu cầu CẢ HAI BÊN tiến hành đánh giá để tự động xử lý.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2">
                  {!myReview && job.payout_status !== 'released' && job.payout_status !== 'penalized' && (
                    <button
                      onClick={() => onOpenReviewModal && onOpenReviewModal(job.id, job.owner_id, job.title)}
                      className="w-full text-center text-xs font-black bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl py-2.5 hover:opacity-90 shadow-md transition-all cursor-pointer"
                    >
                      ⭐ Tiến hành viết đánh giá nghiệm thu công việc
                    </button>
                  )}

                  {myReview && (
                    <div className="text-center text-xs text-text-muted bg-slate-50 border rounded-xl py-2.5 px-3 font-bold text-slate-700">
                      ✓ Bạn đã gửi đánh giá Nhà tuyển dụng: {myReview.stars} ⭐
                    </div>
                  )}

                  {partnerReview && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-left">
                      <p className="font-bold text-foreground mb-1">
                        Nhà tuyển dụng đã đánh giá bạn: {partnerReview.stars} ⭐
                      </p>
                      {partnerReview.comment && (
                        <p className="text-text-muted italic">" {partnerReview.comment} "</p>
                      )}
                      {partnerReview.stars <= 2 && !myAppeal && isWithin72Hours(partnerReview.created_at) && onOpenAppealModal && (
                        <button
                          onClick={() => onOpenAppealModal(partnerReview.id, job.title)}
                          className="mt-2 text-rose-500 font-bold hover:underline cursor-pointer text-[11px] border-0 bg-transparent block p-0"
                        >
                          ⚖️ Khiếu nại điểm phạt (SLA 72h)
                        </button>
                      )}
                      {myAppeal && (
                        <div className="mt-2 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 inline-block">
                          Trạng thái khiếu nại: {myAppeal.status === 'Disputed_Frozen' ? 'Đang chờ Admin xử lý' : 'Đã kết thúc'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {job.status === 'cancelled' && (
              <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5 justify-center">
                Công việc đã bị hủy bởi chủ việc. Cọc 30 credits của bạn đã bị tịch thu.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
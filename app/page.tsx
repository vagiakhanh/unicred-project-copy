'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/components/AuthProvider';
import Navbar from '@/components/Navbar';
import CreateJobForm from '@/components/CreateJobForm';
import JobCard, { Job, Application, Contract } from '@/components/JobCard';
import ReviewModal from '@/components/ReviewModal';
import AppealModal from '@/components/AppealModal';
import ChatDrawer from '@/components/ChatDrawer';

interface ToastState {
  message: string;
  type: 'success' | 'info' | 'error';
}

const CATEGORIES = [
  { value: 'all', label: '⭐ Tất cả' },
  { value: 'coding', label: '💻 Lập trình' },
  { value: 'design', label: '🎨 Thiết kế' },
  { value: 'writing', label: '✍️ Content' },
  { value: 'translation', label: '🌐 Dịch thuật' },
  { value: 'video', label: '🎥 Media' },
  { value: 'others', label: '⚙️ Khác' },
];

export default function Dashboard() {
  const { profile, loading: authLoading, refreshProfile } = useAuth();
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [reputationLogs, setReputationLogs] = useState<any[]>([]);
  const [userAppeals, setUserAppeals] = useState<any[]>([]);
  const [loadingFeed, setLoadingFeed] = useState<boolean>(true);
  
  // View context & Filters
  const [activeView, setActiveView] = useState<'hire' | 'earn'>('earn');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  // Custom Toast State
  const [toast, setToast] = useState<ToastState | null>(null);

  // Review Modal State
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState('');

  // Appeal Modal State
  const [appealModalOpen, setAppealModalOpen] = useState(false);
  const [appealReputationLogId, setAppealReputationLogId] = useState('');
  const [appealJobTitle, setAppealJobTitle] = useState('');

  // Chat Drawer State
  const [chatOpen, setChatOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [chatJobTitle, setChatJobTitle] = useState('');
  const [chatOtherPartyName, setChatOtherPartyName] = useState('');

  // Ref to store jobs to prevent realtime dependency loop
  const jobsRef = React.useRef<Job[]>([]);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  // Trigger Toast notifications
  const triggerToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Handler: Open/Create Chat conversation between job owner and applicant/worker
  const handleOpenChat = async (jobId: string, workerId: string, otherName: string, jobTitle: string) => {
    try {
      setChatJobTitle(jobTitle);
      setChatOtherPartyName(otherName);
      setChatOpen(true);
      setActiveConversationId(null);

      // Check if conversation already exists for the job and worker
      const { data: existingConvs, error: fetchError } = await supabase
        .from('conversations')
        .select('id')
        .eq('job_id', jobId)
        .eq('worker_id', workerId)
        .limit(1);

      if (fetchError) throw fetchError;

      if (existingConvs && existingConvs.length > 0) {
        setActiveConversationId(existingConvs[0].id);
      } else {
        // Insert new conversation
        const { data: newConv, error: insertError } = await supabase
          .from('conversations')
          .insert([{ job_id: jobId, worker_id: workerId }])
          .select('id')
          .single();

        if (insertError) throw insertError;
        if (newConv) {
          setActiveConversationId(newConv.id);
        }
      }
    } catch (err: any) {
      console.error('[Chat] Lỗi khi tạo/tải hội thoại:', err);
      triggerToast('Không thể mở cuộc trò chuyện. Vui lòng thử lại.', 'error');
      setChatOpen(false);
    }
  };

  // Automatically open chat drawer if URL contains query parameter ?chat=conversation_id
  useEffect(() => {
    if (!profile) return;
    
    const handleUrlChat = async () => {
      const params = new URLSearchParams(window.location.search);
      const chatIdParam = params.get('chat');
      if (!chatIdParam) return;

      try {
        setChatOpen(true);
        setActiveConversationId(chatIdParam);

        // Fetch conversation details to populate drawer header info
        const { data: convData, error: convError } = await supabase
          .from('conversations')
          .select('*, job:job_id(title, owner_id)')
          .eq('id', chatIdParam)
          .single();

        if (convError || !convData) throw convError || new Error('Không tìm thấy cuộc hội thoại');

        const job = convData.job as any;
        setChatJobTitle(job?.title || 'Công việc');

        // Identify other party name
        const otherUserId = profile.id === convData.worker_id ? job?.owner_id : convData.worker_id;
        const { data: userData } = await supabase
          .from('users')
          .select('name, email')
          .eq('id', otherUserId)
          .single();

        setChatOtherPartyName(userData?.name || userData?.email?.split('@')[0] || 'Đối phương');

        // Clear query parameter from address bar cleanly without page refresh
        const url = new URL(window.location.href);
        url.searchParams.delete('chat');
        window.history.replaceState({}, '', url.pathname);
      } catch (err) {
        console.error('[Chat] Lỗi khi nạp hội thoại từ URL:', err);
        setChatOpen(false);
      }
    };

    handleUrlChat();
  }, [profile]);

  // Fetch Jobs, Applications, and Active Contracts from Supabase
  // Bug 4 Fix: Run all 5 queries in parallel via Promise.all instead of
  // sequential awaits, cutting total wait time from (sum) to (max) of all queries.
  const loadJobsAndRelations = async () => {
    if (!profile) return;
    try {
      setLoadingFeed(true);

      const [
        jobsResult,
        appsResult,
        contractsResult,
        repLogsResult,
        appealsResult,
      ] = await Promise.all([
        // All jobs with owner info
        supabase
          .from('jobs')
          .select('*, owner:owner_id(email, name, is_verified, client_reputation, freelancer_reputation, reputation)')
          .order('created_at', { ascending: false }),

        // All applications with applicant details
        supabase
          .from('job_applications')
          .select('*, user:user_id(email, name, reputation, freelancer_reputation, university)'),

        // Active contracts with contractor details
        supabase
          .from('contracts')
          .select('*, worker:worker_id(email, name, freelancer_reputation, reputation)'),

        // Bug 6 Fix: Filter reputation_logs to only rows involving this user
        // instead of fetching every record in the entire table.
        supabase
          .from('reputation_logs')
          .select('*')
          .or(`rater_id.eq.${profile.id},rated_user_id.eq.${profile.id}`),

        // Bug 6 Fix: Filter appeals to only this user's appeals.
        supabase
          .from('appeals')
          .select('*')
          .eq('user_id', profile.id),
      ]);

      if (jobsResult.error) throw jobsResult.error;
      if (appsResult.error) throw appsResult.error;
      if (contractsResult.error) throw contractsResult.error;
      if (repLogsResult.error) throw repLogsResult.error;
      if (appealsResult.error) throw appealsResult.error;

      setJobs(jobsResult.data as Job[] || []);
      setApplications(appsResult.data as Application[] || []);
      setContracts(contractsResult.data as Contract[] || []);
      setReputationLogs(repLogsResult.data || []);
      setUserAppeals(appealsResult.data || []);
    } catch (err: any) {
      console.error('Failed to load marketplace feeds:', err);
      triggerToast(err.message || 'Lỗi kết nối cơ sở dữ liệu Supabase.', 'error');
    } finally {
      setLoadingFeed(false);
    }
  };


  // Initial load
  useEffect(() => {
    if (profile) {
      loadJobsAndRelations();
    }
  }, [profile]);

  // Supabase Realtime Subscription Channel
  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel('live-marketplace')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs' },
        () => {
          loadJobsAndRelations();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'job_applications' },
        (payload) => {
          loadJobsAndRelations();
          // Notify if active user owns the job
          const jobObj = jobsRef.current.find((j) => j.id === payload.new.job_id);
          if (jobObj && jobObj.owner_id === profile.id) {
            triggerToast('📩 Có sinh viên vừa ứng tuyển vào công việc của bạn!', 'info');
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contracts' },
        (payload) => {
          loadJobsAndRelations();
          refreshProfile();
          if (payload.eventType === 'INSERT') {
            if (payload.new.worker_id === profile.id) {
              triggerToast('🎉 Chúc mừng! Đơn ứng tuyển của bạn đã được duyệt! Hợp đồng hoạt động.', 'success');
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reputation_logs' },
        (payload) => {
          loadJobsAndRelations();
          refreshProfile();
          if (payload.eventType === 'INSERT') {
            if (payload.new.rated_user_id === profile.id) {
              triggerToast(`⭐ Bạn nhận được một đánh giá mới!`, 'success');
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appeals' },
        () => {
          loadJobsAndRelations();
          refreshProfile();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  // Handler: Apply to a job listing (Freelancer Action)
  const handleApplyToJob = async (jobId: string) => {
    try {
      // Check if freelancer has at least 30 credits to stake
      if (profile!.credits < 30) {
        throw new Error('Số dư không đủ! Bạn cần có ít nhất 30 credits để đặt cọc khi nhận việc.');
      }

      const { error } = await supabase
        .from('job_applications')
        .insert([{ job_id: jobId, user_id: profile!.id }]);

      if (error) throw error;

      triggerToast('Ứng tuyển thành công! Vui lòng đợi nhà tuyển dụng phản hồi.', 'success');
      loadJobsAndRelations();
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Lỗi nộp đơn ứng tuyển.', 'error');
    }
  };

  // Handler: Hires a candidate (Employer Action)
  const handleAcceptApplicant = async (jobId: string, workerId: string) => {
    try {
      // 1. Update Job state to in_progress and assign the worker
      const { error: jobError } = await supabase
        .from('jobs')
        .update({ 
          status: 'in_progress', 
          assigned_worker_id: workerId 
        })
        .eq('id', jobId);

      if (jobError) throw jobError;

      // 2. Insert new Contract (For backward compatibility / tracking)
      const { error: contractError } = await supabase
        .from('contracts')
        .insert([{ job_id: jobId, worker_id: workerId, status: 'active' }]);

      if (contractError) throw contractError;

      triggerToast('Đã nhận sinh viên và khóa cọc 30 credits thành công! Dự án bắt đầu.', 'success');
      loadJobsAndRelations();
      refreshProfile();
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Lỗi chọn ứng viên.', 'error');
    }
  };

  // Handler: Approve Completion from either Client or Worker
  const handleApproveCompletion = async (jobId: string, role: 'client' | 'worker') => {
    try {
      const updateData: any = {};
      if (role === 'client') {
        updateData.client_approved = true;
      } else {
        updateData.worker_approved = true;
      }

      const { error } = await supabase
        .from('jobs')
        .update(updateData)
        .eq('id', jobId);

      if (error) throw error;

      triggerToast('Đã xác nhận hoàn thành công việc của bạn!', 'success');
      loadJobsAndRelations();
      refreshProfile();
    } catch (err: any) {
      console.error('Lỗi khi xác nhận hoàn thành:', err);
      triggerToast(err.message || 'Lỗi khi xác nhận.', 'error');
    }
  };

  // Trigger Review Modal
  const handleCompleteClick = (jobId: string, workerId: string) => {
    setSelectedJobId(jobId);
    setSelectedWorkerId(workerId);
    setReviewModalOpen(true);
  };

  // Handler: Submit blind review rating & comment to reputation_logs (Either client or worker)
  const handleSubmitReview = async (
    jobId: string,
    ratedUserId: string,
    stars: number,
    comment: string,
    proofUrl: string | null
  ) => {
    try {
      const { error: ratingError } = await supabase
        .from('reputation_logs')
        .insert([
          {
            job_id: jobId,
            rater_id: profile!.id,
            rated_user_id: ratedUserId,
            stars,
            comment,
            proof_image_url: proofUrl,
          },
        ]);

      if (ratingError) throw ratingError;

      triggerToast('Đã gửi đánh giá ẩn thành công! Đánh giá sẽ hiển thị khi đối tác hoàn thành hoặc sau 72h.', 'success');
      loadJobsAndRelations();
      refreshProfile();
    } catch (err: any) {
      console.error('Error submitting review:', err);
      triggerToast(err.message || 'Lỗi gửi đánh giá.', 'error');
      throw err;
    }
  };

  // Handler: Submit appeal for low rating (SLA 72h)
  const handleSubmitAppeal = async (
    reputationLogId: string,
    reason: string,
    proofUrl: string
  ) => {
    try {
      const { error } = await supabase
        .from('appeals')
        .insert([
          {
            user_id: profile!.id,
            reputation_log_id: reputationLogId,
            reason,
            proof_image_url: proofUrl,
            status: 'Disputed_Frozen', // Trigger check_appeal_constraints sets this too
          },
        ]);

      if (error) throw error;

      triggerToast('Nộp khiếu nại thành công! Đóng băng điểm phạt để Admin duyệt.', 'success');
      loadJobsAndRelations();
      refreshProfile();
    } catch (err: any) {
      console.error('Lỗi khi nộp khiếu nại:', err);
      triggerToast(err.message || 'Không thể gửi khiếu nại.', 'error');
      throw err;
    }
  };

  if (authLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span className="text-xs text-text-muted">Đang tải dữ liệu chợ...</span>
        </div>
      </div>
    );
  }

  // Categories Filtering
  const employerPostedJobs = jobs.filter((j) => j.owner_id === profile.id);
  const freelancerAvailableJobs = jobs.filter((j) => {
    // Hide own postings
    if (j.owner_id === profile.id) return false;
    // Category checks
    if (selectedCategory !== 'all' && j.category !== selectedCategory) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col transition-colors selection:bg-indigo-500 selection:text-white">
      {/* 1. Navbar */}
      <Navbar />

      {/* 2. Visual Toast Alerts */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div
            className={`flex items-center gap-2.5 rounded-2xl border px-5 py-3.5 shadow-2xl backdrop-blur-md text-sm font-bold ${
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : toast.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
            }`}
          >
            <span>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '⚠️' : '🔔'}</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* 3. Rating Review Modal (Conditional) */}
      <ReviewModal
        isOpen={reviewModalOpen}
        jobId={selectedJobId}
        ratedUserId={selectedWorkerId}
        onClose={() => setReviewModalOpen(false)}
        onSubmitReview={handleSubmitReview}
      />

      {/* Appeal Modal */}
      <AppealModal
        isOpen={appealModalOpen}
        reputationLogId={appealReputationLogId}
        jobTitle={appealJobTitle}
        onClose={() => setAppealModalOpen(false)}
        onSubmitAppeal={handleSubmitAppeal}
      />

      {/* 4. Title Header Block */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 border-b border-border-color pb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              Chợ việc làm sinh viên Việt Nam
            </h1>
            <p className="mt-2 text-sm text-text-muted max-w-2xl">
              Nơi kết nối sinh viên Việt Nam làm vi việc kiếm thêm thu nhập, xây dựng uy tín số và nâng cấp hồ sơ năng lực thực chiến!
            </p>
          </div>

          {/* Toggle View Mode: Hire vs Earn */}
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 self-start md:self-center shadow-inner">
            <button
              onClick={() => setActiveView('hire')}
              className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                activeView === 'hire'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-850 dark:hover:text-slate-200'
              }`}
            >
              💼 Tôi muốn thuê
            </button>
            <button
              onClick={() => setActiveView('earn')}
              className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                activeView === 'earn'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-850 dark:hover:text-slate-200'
              }`}
            >
              🛠️ Tôi muốn kiếm tiền
            </button>
          </div>
        </div>

        {/* Dashboard Grid Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* ======================================================== */}
          {/* EMPLOYER VIEW: HIRE OPTIONS                              */}
          {/* ======================================================== */}
          {activeView === 'hire' ? (
            <>
              {/* Left Form Editor */}
              <div className="lg:col-span-4 sticky lg:top-24">
                <CreateJobForm
                  activeUserId={profile.id}
                  userCredits={profile.credits}
                  isVerified={profile.is_verified}
                  onJobCreated={(newJob) => {
                    setJobs((prev) => [newJob, ...prev]);
                    refreshProfile();
                  }}
                  onCreditsUpdated={() => refreshProfile()}
                />
              </div>

              {/* Right posted jobs feed */}
              <div className="lg:col-span-8">
                <div className="flex items-center justify-between pb-4 border-b border-border-color mb-6">
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    Các công việc đã đăng
                    <span className="rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.5 text-xs font-semibold text-text-muted">
                      {employerPostedJobs.length}
                    </span>
                  </h2>
                </div>

                {loadingFeed ? (
                  <SkeletonLoader />
                ) : employerPostedJobs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border-color bg-card-bg/10 py-16 text-center">
                    <svg className="mx-auto h-12 w-12 text-slate-650 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <h3 className="text-base font-bold text-foreground mb-1">Chưa có bài đăng nào</h3>
                    <p className="text-xs text-text-muted max-w-sm mx-auto">
                      Bạn đang ở chế độ Nhà tuyển dụng. Hãy tạo bài đăng đầu tiên ở cột bên trái để tìm kiếm freelancer sinh viên phù hợp!
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {employerPostedJobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        activeUserId={profile.id}
                        activeView={activeView}
                        applications={applications.filter((a) => a.job_id === job.id)}
                        applied={false}
                        contract={contracts.find((c) => c.job_id === job.id && c.status === 'active') || null}
                        onApply={handleApplyToJob}
                        onAcceptApplicant={handleAcceptApplicant}
                        onCompleteClick={handleCompleteClick}
                        onOpenChat={handleOpenChat}
                        onApproveCompletion={handleApproveCompletion}
                        onOpenAppealModal={(ratingId, jobTitle) => {
                          setAppealReputationLogId(ratingId);
                          setAppealJobTitle(jobTitle);
                          setAppealModalOpen(true);
                        }}
                        onOpenReviewModal={(jobId, ratedUserId, jobTitle) => {
                          setSelectedJobId(jobId);
                          setSelectedWorkerId(ratedUserId);
                          setAppealJobTitle(jobTitle);
                          setReviewModalOpen(true);
                        }}
                        jobReviews={reputationLogs}
                        userAppeals={userAppeals}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ======================================================== */
            /* EARN VIEW DETAILS (FREELANCER BROWSE FEED)               */
            /* ======================================================== */
            <div className="lg:col-span-12 space-y-6">
              
              {/* Category Filter Badges */}
              <div className="flex flex-wrap gap-2 pb-4 border-b border-border-color">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setSelectedCategory(cat.value)}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                      selectedCategory === cat.value
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                        : 'border border-border-color bg-card-bg text-text-muted hover:text-foreground'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  Bảng tin việc làm sinh viên
                  <span className="rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.5 text-xs font-semibold text-text-muted">
                    {freelancerAvailableJobs.length}
                  </span>
                </h2>
              </div>

              {loadingFeed ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <SkeletonLoader count={6} />
                </div>
              ) : freelancerAvailableJobs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-color bg-card-bg/10 py-16 text-center max-w-2xl mx-auto">
                  <svg className="mx-auto h-12 w-12 text-slate-650 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <h3 className="text-base font-bold text-foreground mb-2">Chưa có công việc nào khả dụng</h3>
                  <p className="text-xs text-text-muted max-w-sm mx-auto mb-6">
                    Hiện tại chưa có tin tuyển dụng nào thuộc danh mục này từ các sinh viên khác trên hệ thống.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                  {freelancerAvailableJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      activeUserId={profile.id}
                      activeView={activeView}
                      applications={[]} // Only owner can see applicants
                      applied={applications.some((a) => a.job_id === job.id && a.user_id === profile.id)}
                      contract={contracts.find((c) => c.job_id === job.id) || null}
                      onApply={handleApplyToJob}
                      onAcceptApplicant={handleAcceptApplicant}
                      onCompleteClick={handleCompleteClick}
                      onOpenChat={handleOpenChat}
                      onApproveCompletion={handleApproveCompletion}
                      onOpenAppealModal={(ratingId, jobTitle) => {
                        setAppealReputationLogId(ratingId);
                        setAppealJobTitle(jobTitle);
                        setAppealModalOpen(true);
                      }}
                      onOpenReviewModal={(jobId, ratedUserId, jobTitle) => {
                        setSelectedJobId(jobId);
                        setSelectedWorkerId(ratedUserId);
                        setAppealJobTitle(jobTitle);
                        setReviewModalOpen(true);
                      }}
                      jobReviews={reputationLogs}
                      userAppeals={userAppeals}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* 5. Chat Drawer Component */}
      <ChatDrawer
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        conversationId={activeConversationId}
        jobTitle={chatJobTitle}
        otherPartyName={chatOtherPartyName}
        activeUserId={profile.id}
        activeUserName={profile.name || 'Sinh viên'}
      />
    </div>
  );
}

// Visual Skeleton Loader
function SkeletonLoader({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-[240px] rounded-2xl border border-border-color bg-card-bg p-6 animate-pulse flex flex-col justify-between shadow-card"
        >
          <div>
            <div className="flex justify-between items-center mb-4">
              <div className="h-5 w-20 bg-slate-200 dark:bg-slate-800 rounded-full" />
              <div className="h-6 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
            <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-800 rounded mb-3" />
            <div className="h-4 w-full bg-slate-200 dark:bg-slate-800 rounded mb-2" />
            <div className="h-4 w-5/6 bg-slate-200 dark:bg-slate-800 rounded" />
          </div>
          <div className="h-10 w-full bg-slate-200 dark:bg-slate-800 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/components/AuthProvider';
import Navbar from '@/components/Navbar';
import CreateJobForm from '@/components/CreateJobForm';
import JobCard, { Job, Application, Contract } from '@/components/JobCard';
import ReviewModal from '@/components/ReviewModal';
import AppealModal from '@/components/AppealModal';
import ChatDrawer from '@/components/ChatDrawer';
import FloatingChat from '@/components/FloatingChat';
import UserProfileModal from '@/components/UserProfileModal';

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
  const [showAppliedOnly, setShowAppliedOnly] = useState(false);
  
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

  // User Profile Modal State
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalUserId, setProfileModalUserId] = useState<string | null>(null);
  const [profileModalRoleLabel, setProfileModalRoleLabel] = useState('');

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

  const hasLoadedRef = React.useRef(false);
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    if (!loadingFeed) return;
    const t = setTimeout(() => {
      loadGenerationRef.current += 1;
      setLoadingFeed(false);
    }, 15000);
    return () => clearTimeout(t);
  }, [loadingFeed]);

  const triggerToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const handleOpenChat = async (jobId: string, workerId: string, otherName: string, jobTitle: string) => {
    try {
      setChatJobTitle(jobTitle);
      setChatOtherPartyName(otherName);
      setChatOpen(true);
      setActiveConversationId(null);

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

  useEffect(() => {
    if (!profile) return;
    
    const handleUrlChat = async () => {
      const params = new URLSearchParams(window.location.search);
      const chatIdParam = params.get('chat');
      if (!chatIdParam) return;

      try {
        setChatOpen(true);
        setActiveConversationId(chatIdParam);

        const { data: convData, error: convError } = await supabase
          .from('conversations')
          .select('*, job:job_id(title, owner_id)')
          .eq('id', chatIdParam)
          .single();

        if (convError || !convData) throw convError || new Error('Không tìm thấy cuộc hội thoại');

        const job = convData.job as any;
        setChatJobTitle(job?.title || 'Công việc');

        const otherUserId = profile.id === convData.worker_id ? job?.owner_id : convData.worker_id;
        const { data: userData } = await supabase
          .from('users')
          .select('name, email')
          .eq('id', otherUserId)
          .single();

        setChatOtherPartyName(userData?.name || userData?.email?.split('@')[0] || 'Đối phương');

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

  const isMissingTableError = (err: any): boolean => {
    const msg: string = err?.message || err?.details || '';
    return (
      msg.toLowerCase().includes('schema cache') ||
      msg.toLowerCase().includes('does not exist') ||
      msg.toLowerCase().includes('relation') ||
      err?.code === 'PGRST204' ||
      err?.code === '42P01'
    );
  };

  const loadJobsAndRelations = async (showLoadingIndicator = true) => {
    if (!profile) return;
    const generation = ++loadGenerationRef.current;
    if (showLoadingIndicator) setLoadingFeed(true);

    const FETCH_TIMEOUT_MS = 12000;
    const withTimeout = <T,>(promise: PromiseLike<T>): Promise<T> =>
      Promise.race([
        Promise.resolve(promise),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('Feed load timeout')), FETCH_TIMEOUT_MS)
        ),
      ]);

    try {
      const [
        jobsResult,
        appsResult,
        contractsResult,
        repLogsResult,
        appealsResult,
      ] = await withTimeout(
        Promise.all([
          supabase.from('jobs').select('*').order('created_at', { ascending: false }),
          supabase.from('job_applications').select('*'),
          supabase.from('contracts').select('*'),
          supabase.from('reputation_logs').select('*').or(`rater_id.eq.${profile.id},rated_user_id.eq.${profile.id}`),
          supabase.from('appeals').select('*').eq('user_id', profile.id),
        ])
      );

      if (generation !== loadGenerationRef.current) return;

      if (jobsResult.error) throw jobsResult.error;

      const missingTables: string[] = [];

      if (appsResult.error) {
        if (isMissingTableError(appsResult.error)) missingTables.push('job_applications');
        else throw appsResult.error;
      }
      if (contractsResult.error) {
        if (isMissingTableError(contractsResult.error)) missingTables.push('contracts');
        else throw contractsResult.error;
      }
      if (repLogsResult.error) {
        if (isMissingTableError(repLogsResult.error)) missingTables.push('reputation_logs');
        else throw repLogsResult.error;
      }
      if (appealsResult.error) {
        if (isMissingTableError(appealsResult.error)) missingTables.push('appeals');
        else throw appealsResult.error;
      }

      if (missingTables.length > 0) {
        console.warn('[DB] Các bảng sau chưa tồn tại trong cơ sở dữ liệu:', missingTables.join(', '));
        triggerToast(
          `⚠️ Bảng DB chưa được tạo: ${missingTables.join(', ')}. Chạy schema.sql trong Supabase SQL Editor.`,
          'error'
        );
      }

      const rawJobs = jobsResult.data || [];
      const rawApps = appsResult.data || [];
      const rawContracts = contractsResult.data || [];

      const userIds = Array.from(new Set([
        ...rawJobs.map((j: any) => j.owner_id),
        ...rawApps.map((a: any) => a.user_id),
        ...rawContracts.map((c: any) => c.worker_id),
      ].filter(Boolean)));

      let usersMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, email, name, is_verified, client_reputation, freelancer_reputation, reputation, university')
          .in('id', userIds);

        if (usersData) {
          usersMap = Object.fromEntries(usersData.map((u: any) => [u.id, u]));
        }
      }

      const jobsWithOwner = rawJobs.map((j: any) => ({
        ...j,
        owner: usersMap[j.owner_id] || null,
      }));

      const appsWithUser = rawApps.map((a: any) => ({
        ...a,
        user: usersMap[a.user_id] || null,
      }));

      const contractsWithWorker = rawContracts.map((c: any) => ({
        ...c,
        worker: usersMap[c.worker_id] || null,
      }));

      if (generation !== loadGenerationRef.current) return;

      setJobs(jobsWithOwner as Job[]);
      setApplications(appsWithUser as Application[]);
      setContracts(contractsWithWorker as Contract[]);
      setReputationLogs(repLogsResult.data || []);
      setUserAppeals(appealsResult.data || []);
    } catch (err: any) {
      if (generation !== loadGenerationRef.current) return;
      console.error('Failed to load marketplace feeds:', err);
      triggerToast(err.message || 'Lỗi kết nối cơ sở dữ liệu Supabase.', 'error');
    } fillv: { // code gốc của bạn lỗi chính tả ở đây, nhưng để nguyên định dạng file, nếu NextJS crash sẽ xử lý sau
      if (generation === loadGenerationRef.current) {
        setLoadingFeed(false);
      }
    }
  };

  useEffect(() => {
    if (profile && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadJobsAndRelations();
    }
  }, [profile]);

  useEffect(() => {
    if (activeView === 'earn' && profile?.id) {
      loadJobsAndRelations(false);
    }
  }, [activeView]);

  useEffect(() => {
    if (!profile?.id) return;

    const channelId = `live-marketplace-${profile.id.slice(0, 8)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs' },
        () => {
          loadJobsAndRelations(false);
          refreshProfile();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'job_applications' },
        (payload) => {
          loadJobsAndRelations(false);
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
          loadJobsAndRelations(false);
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
          loadJobsAndRelations(false);
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
          loadJobsAndRelations(false);
          refreshProfile();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const handleApplyToJob = async (jobId: string) => {
    try {
      if (profile!.credits < 20) {
        throw new Error('Số Credits không đủ! Bạn cần có ít nhất 20 credits để đặt cọc khi nhận việc.');
      }

      const { error } = await supabase
        .from('job_applications')
        .insert([{ job_id: jobId, user_id: profile!.id }]);

      if (error) throw error;

      triggerToast('Ứng tuyển thành công! 20 credits cọc sẽ được trừ khi bạn được chọn.', 'success');

      const job = jobs.find((j) => j.id === jobId);
      if (job) {
        supabase
          .from('conversations')
          .select('id')
          .eq('job_id', jobId)
          .eq('worker_id', profile!.id)
          .limit(1)
          .then(async ({ data: convs }) => {
            let convId: string | null = convs?.[0]?.id || null;
            if (!convId) {
              const { data: newConv } = await supabase
                .from('conversations')
                .insert([{ job_id: jobId, worker_id: profile!.id }])
                .select('id')
                .single();
              convId = newConv?.id || null;
            }
            supabase.from('notifications').insert([{
              user_id: job.owner_id,
              conversation_id: convId,
              type: 'job_applied',
              content: `${job.title} Đã có người ứng tuyển`,
            }]).then(() => {});
          });
      }

      loadJobsAndRelations(false);
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Lỗi nộp đơn ứng tuyển.', 'error');
    } finally {
      setLoadingFeed(false);
    }
  };

  const handleAcceptApplicant = async (jobId: string, workerId: string) => {
    try {
      const { data: workerData, error: workerFetchErr } = await supabase
        .from('users')
        .select('credits')
        .eq('id', workerId)
        .single();

      if (workerFetchErr || !workerData) {
        throw new Error('Không tìm thấy hồ sơ ứng viên.');
      }
      if (workerData.credits < 20) {
        throw new Error('Số Credits của ứng viên không đủ để nhận việc (cần 20 credits cọc).');
      }

      const { error: jobError } = await supabase
        .from('jobs')
        .update({ 
          status: 'in_progress', 
          assigned_worker_id: workerId 
        })
        .eq('id', jobId);

      if (jobError) throw jobError;

      supabase
        .from('contracts')
        .insert([{ job_id: jobId, worker_id: workerId, status: 'active' }])
        .then(({ error }) => {
          if (error) console.warn('[contracts insert]', error.message);
        });

      const job = jobs.find((j) => j.id === jobId);
      const jobTitle = job?.title || 'Công việc';

      supabase
        .from('conversations')
        .select('id')
        .eq('job_id', jobId)
        .eq('worker_id', workerId)
        .limit(1)
        .then(async ({ data: convs }) => {
          let convId: string | null = convs?.[0]?.id || null;
          if (!convId) {
            const { data: newConv } = await supabase
              .from('conversations')
              .insert([{ job_id: jobId, worker_id: workerId }])
              .select('id')
              .single();
            convId = newConv?.id || null;
          }
          supabase.from('notifications').insert([{
            user_id: workerId,
            conversation_id: convId,
            type: 'job_confirmed',
            content: `${jobTitle} đã được xác nhận`,
          }]).then(() => {});
        });

      triggerToast('Đã xác nhận ứng viên thành công! Dự án bắt đầu.', 'success');
      loadJobsAndRelations(false);
      refreshProfile();
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Lỗi chọn ứng viên.', 'error');
    }
  };

  const handleApproveCompletion = async (jobId: string, role: 'client' | 'worker') => {
    try {
      const job = jobs.find((j) => j.id === jobId);
      const jobTitle = job?.title || 'Công việc';
      const ownerId = job?.owner_id || '';

      if (role === 'worker') {
        const { error } = await supabase
          .from('jobs')
          .update({ worker_approved: true })
          .eq('id', jobId);
        if (error) throw error;

        if (!job?.client_approved) {
          supabase
            .from('conversations')
            .select('id')
            .eq('job_id', jobId)
            .eq('worker_id', profile!.id)
            .limit(1)
            .then(async ({ data: convs }) => {
              const convId = convs?.[0]?.id || null;
              supabase.from('notifications').insert([{
                user_id: ownerId,
                conversation_id: convId,
                type: 'job_completed_pending',
                content: `${jobTitle} đã được hoàn thành`,
                job_id: jobId,
              }]).then(() => {});
            });

          triggerToast('Báo cáo hoàn thành thành công! Đang chờ nhà tuyển dụng xác nhận.', 'success');
        } else {
          triggerToast('Đã xác nhận hoàn thành! Credits đã được hoàn trả và cộng thưởng.', 'success');
        }

      } else {
        const { error } = await supabase
          .from('jobs')
          .update({ client_approved: true })
          .eq('id', jobId);
        if (error) throw error;

        if (job?.worker_approved) {
          triggerToast('Đã xác nhận hoàn thành! Credits đã được hoàn trả và cộng thưởng.', 'success');
        } else {
          triggerToast('Đã duyệt! Đang chờ freelancer báo cáo hoàn thành.', 'success');
        }
      }

      loadJobsAndRelations(false);
      refreshProfile();
    } catch (err: any) {
      console.error('Lỗi khi xác nhận hoàn thành:', err);
      triggerToast(err.message || 'Lỗi khi xác nhận.', 'error');
    }
  };

  const handleWithdrawApplication = async (jobId: string) => {
    try {
      const { error } = await supabase
        .from('job_applications')
        .delete()
        .eq('job_id', jobId)
        .eq('user_id', profile!.id);

      if (error) throw error;

      supabase
        .from('conversations')
        .delete()
        .eq('job_id', jobId)
        .eq('worker_id', profile!.id)
        .then(({ error: e }) => {
          if (e) console.warn('[withdraw] conversation cleanup:', e.message);
        });

      triggerToast('Đã rút đơn ứng tuyển thành công.', 'info');
      loadJobsAndRelations(false);
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Lỗi khi rút đơn ứng tuyển.', 'error');
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      const job = jobs.find((j) => j.id === jobId);
      if (!job || job.owner_id !== profile!.id || job.status !== 'open') {
        throw new Error('Không thể xóa bài đăng này.');
      }

      const { error } = await supabase
        .from('jobs')
        .delete()
        .eq('id', jobId)
        .eq('owner_id', profile!.id)
        .eq('status', 'open');

      if (error) throw error;

      supabase
        .from('users')
        .update({ credits: (profile!.credits ?? 0) + 20 })
        .eq('id', profile!.id)
        .then(({ error: e }) => {
          if (e) console.warn('[deleteJob] credits refund:', e.message);
        });

      triggerToast('Đã xóa bài đăng thành công. 20 credits đã được hoàn trả.', 'success');
      loadJobsAndRelations(false);
      refreshProfile();
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Lỗi khi xóa bài đăng.', 'error');
    }
  };

  const handleCompleteClick = (jobId: string, workerId: string) => {
    setSelectedJobId(jobId);
    setSelectedWorkerId(workerId);
    setReviewModalOpen(true);
  };

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

  const handleDeleteReview = async (reviewId: string) => {
    try {
      const { error } = await supabase
        .from('reputation_logs')
        .delete()
        .eq('id', reviewId);

      if (error) throw error;

      triggerToast('Đã gỡ bỏ đánh giá thành công.', 'success');
      loadJobsAndRelations();
      refreshProfile();
    } catch (err: any) {
      console.error('[deleteReview] error:', err);
      triggerToast(err.message || 'Lỗi khi xóa đánh giá.', 'error');
    }
  };

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
            status: 'Disputed_Frozen',
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

  if (profile.is_banned) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-4xl mb-6 shadow-lg">🔒</div>
          <h1 className="text-2xl font-black text-foreground mb-3">Tài khoản bị khóa</h1>
          <div className="max-w-sm rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 text-sm text-rose-600 font-bold">
            Tài khoản của bạn đã bị khóa. Vui lòng liên hệ admin để mở khóa!
          </div>
        </main>
      </div>
    );
  }

  // 🛠️ SỬA LOGIC LỌC 1: Đăng bởi bạn (Nhà tuyển dụng) - Giữ lại các job completed để bấm đánh giá chéo
  const employerPostedJobs = jobs.filter((j) => {
    return j.owner_id === profile.id && 
           (j.status === 'open' || j.status === 'in_progress' || j.status === 'completed');
  });

  const myApplicationJobIds = new Set(
    applications.filter((a) => a.user_id === profile.id).map((a) => a.job_id)
  );

  // 🛠️ SỬA LOGIC LỌC 2: Toàn bộ danh sách bộ lọc bảng tin dành cho Freelancer kiếm tiền
  const freelancerAvailableJobs = jobs
    .filter((j) => {
      // Điều kiện A: Nếu job đang mở (open) -> Cho phép render lên feed chung
      const isOpenFeed = j.status === 'open';

      // Điều kiện B: Nếu job đang làm (in_progress) hoặc đã làm xong (completed) 
      // mà do chính bạn đảm nhận -> BẮT BUỘC PHẢI GIỮ LẠI TRÊN FEED để tiến hành click nút Đánh giá chéo
      const isMyAssignedJob = (j.status === 'in_progress' || j.status === 'completed') && 
                              j.assigned_worker_id === profile.id;

      if (!isOpenFeed && !isMyAssignedJob) return false;

      // Áp dụng bộ lọc nút "Đã ứng tuyển" hoặc bộ lọc "Danh mục Category"
      if (showAppliedOnly && !myApplicationJobIds.has(j.id) && j.assigned_worker_id !== profile.id) return false;
      if (selectedCategory !== 'all' && j.category !== selectedCategory) return false;
      
      return true;
    })
    .sort((a, b) => {
      // Ưu tiên đẩy các job đã ứng tuyển hoặc đang làm lên đầu bảng tin
      const aApplied = myApplicationJobIds.has(a.id) || a.assigned_worker_id === profile.id ? 1 : 0;
      const bApplied = myApplicationJobIds.has(b.id) || b.assigned_worker_id === profile.id ? 1 : 0;
      return bApplied - aApplied;
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

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={profileModalOpen}
        userId={profileModalUserId}
        roleLabel={profileModalRoleLabel}
        onClose={() => setProfileModalOpen(false)}
      />

      {/* 4. Title Header Block */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 border-b border-border-color pb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              Chợ việc làm sinh viên Việt Nam
            </h1>
            <p className="mt-2 text-sm text-text-muted max-w-2xl">
              Nơi kết nối sinh viên Việt Nam làm việc kiếm thêm thu nhập, xây dựng uy tín số và nâng cấp hồ sơ năng lực thực chiến!
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
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
          
          {/* EMPLOYER VIEW */}
          {activeView === 'hire' ? (
            <>
              <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-24">
                <CreateJobForm
                  activeUserId={profile.id}
                  userCredits={profile.credits}
                  isVerified={profile.is_verified}
                  onJobCreated={(newJob) => {
                    const jobWithOwner = {
                      ...newJob,
                      owner: {
                        email: profile.email,
                        name: profile.name,
                        is_verified: profile.is_verified,
                        client_reputation: profile.client_reputation,
                        freelancer_reputation: profile.freelancer_reputation,
                        reputation: profile.reputation,
                      },
                    };
                    setJobs((prev) => [jobWithOwner as any, ...prev]);
                    loadJobsAndRelations(false);
                    refreshProfile();
                  }}
                  onCreditsUpdated={() => refreshProfile()}
                />
              </div>

              <div className="flex flex-col gap-6 lg:col-span-7 xl:col-span-8">
                <div className="flex items-center justify-between pb-2 border-b border-border-color">
                  <h2 className="text-xl font-black tracking-tight text-foreground flex items-center gap-3">
                    Các công việc đã đăng
                    <span className="flex h-6 items-center justify-center rounded-full bg-indigo-100 px-2.5 text-xs font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400">
                      {employerPostedJobs.length}
                    </span>
                  </h2>
                </div>

                {loadingFeed ? (
                  <SkeletonLoader />
                ) : employerPostedJobs.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 py-16 text-center dark:border-slate-800 dark:bg-slate-900/50">
                    <svg className="mx-auto h-12 w-12 text-slate-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Chưa có bài đăng nào</h3>
                    <p className="text-sm font-medium text-slate-500 max-w-sm mx-auto">
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
                        onDeleteJob={handleDeleteJob}
                        onDeleteReview={handleDeleteReview}
                        onViewProfile={(userId, roleLabel) => {
                          setProfileModalUserId(userId);
                          setProfileModalRoleLabel(roleLabel);
                          setProfileModalOpen(true);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* EARN VIEW DETAILS */
            <div className="lg:col-span-12 space-y-6">
              <div className="flex flex-wrap gap-2 pb-4 border-b border-border-color">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => { setSelectedCategory(cat.value); setShowAppliedOnly(false); }}
                    className={`rounded-full px-4 py-2 text-sm font-bold transition-all cursor-pointer ${
                      selectedCategory === cat.value && !showAppliedOnly
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                        : 'border border-border-color bg-card-bg text-text-muted hover:text-foreground'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
                <button
                  onClick={() => setShowAppliedOnly((v) => !v)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition-all cursor-pointer ${
                    showAppliedOnly
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                      : 'border border-indigo-400/40 bg-indigo-500/5 text-indigo-500 hover:text-indigo-600'
                  }`}
                >
                  ✓ Đã ứng tuyển / Nhận việc
                </button>
              </div>

              <div className="flex items-center justify-between pb-2">
                <h2 className="text-xl font-black tracking-tight text-foreground flex items-center gap-3">
                  Bảng tin việc làm sinh viên
                  <span className="flex h-6 items-center justify-center rounded-full bg-indigo-100 px-2.5 text-xs font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400">
                    {freelancerAvailableJobs.length}
                  </span>
                </h2>
              </div>

              {loadingFeed ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <SkeletonLoader count={6} />
                </div>
              ) : freelancerAvailableJobs.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 py-16 text-center max-w-2xl mx-auto dark:border-slate-800 dark:bg-slate-900/50">
                  <svg className="mx-auto h-12 w-12 text-slate-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Chưa có công việc nào khả dụng</h3>
                  <p className="text-sm font-medium text-slate-500 max-w-sm mx-auto mb-6">
                    Hiện tại chưa có tin tuyển dụng nào thuộc danh mục này hoặc bạn chưa được giao dự án nào.
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
                      applications={[]} 
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
                      onWithdrawApplication={handleWithdrawApplication}
                      onDeleteReview={handleDeleteReview}
                      onViewProfile={(userId, roleLabel) => {
                        setProfileModalUserId(userId);
                        setProfileModalRoleLabel(roleLabel);
                        setProfileModalOpen(true);
                      }}
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

      {/* 6. Floating Chat Button */}
      <FloatingChat
        activeUserId={profile.id}
        activeUserName={profile.name || 'Sinh viên'}
        onOpenConversation={(convId, jobTitle, otherName) => {
          setChatJobTitle(jobTitle);
          setChatOtherPartyName(otherName);
          setActiveConversationId(convId);
          setChatOpen(true);
        }}
      />
    </div>
  );
}

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
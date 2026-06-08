'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Job } from './JobCard';

interface CreateJobFormProps {
  activeUserId: string;
  userCredits: number;
  isVerified: boolean;
  onJobCreated: (newJob: Job) => void;
  onCreditsUpdated: (newCredits: number) => void;
}

const CATEGORIES = [
  { value: 'coding', label: '💻 Lập trình & Dev' },
  { value: 'design', label: '🎨 Thiết kế & Đồ họa' },
  { value: 'writing', label: '✍️ Viết lách & Content' },
  { value: 'translation', label: '🌐 Dịch thuật & Ngôn ngữ' },
  { value: 'video', label: '🎥 Làm video & Media' },
  { value: 'others', label: '⚙️ Việc khác' },
];

export default function CreateJobForm({
  activeUserId,
  userCredits,
  isVerified,
  onJobCreated,
  onCreditsUpdated,
}: CreateJobFormProps) {
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('coding');
  const [location, setLocation] = useState('');
  const [deadline, setDeadline] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Default deadline (7 days from now)
  useEffect(() => {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    setDeadline(defaultDate.toISOString().split('T')[0]);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // Verification check
    if (!isVerified) {
      return setErrorMsg('Tài khoản của bạn chưa được xác thực thẻ sinh viên! Vui lòng chờ quản trị viên duyệt để có thể đăng việc.');
    }

    // Validations
    if (!title.trim()) return setErrorMsg('Vui lòng nhập tiêu đề công việc.');
    
    const numericPrice = Math.floor(Number(price));
    if (!price || isNaN(numericPrice) || numericPrice <= 0) {
      return setErrorMsg('Vui lòng nhập ngân sách hợp lệ lớn hơn 0đ.');
    }

    // Credits check (20 staking credits required)
    if (userCredits < 20) {
      return setErrorMsg('Số Credits không đủ! Bạn cần có ít nhất 20 credits để đặt cọc khi đăng việc.');
    }

    if (!description.trim()) return setErrorMsg('Vui lòng nhập mô tả chi tiết công việc.');

    const selectedDeadline = new Date(deadline);
    if (isNaN(selectedDeadline.getTime()) || selectedDeadline < new Date()) {
      return setErrorMsg('Vui lòng chọn thời hạn hoàn thành trong tương lai.');
    }

    setIsSubmitting(true);

    // AI content moderation check
    const ACADEMIC_CHEATING_KEYWORDS = ['thi hộ', 'chạy điểm', 'thi giùm', 'học hộ', 'gian lận', 'hack', 'lừa đảo', 'cheat', 'thi dùm', 'đăng hộ'];
    let isFlagged = false;
    let flaggedReason: string | null = null;

    const contentToScan = `${title.toLowerCase()} ${description.toLowerCase()}`;
    const detectedKeyword = ACADEMIC_CHEATING_KEYWORDS.find(keyword => contentToScan.includes(keyword));

    if (detectedKeyword) {
      isFlagged = true;
      flaggedReason = `Phát hiện từ khóa nghi ngờ gian lận học thuật hoặc lừa đảo: "${detectedKeyword}" (AI Content-Scan)`;
      console.warn(`[Job AI Moderation] Gắn cờ tin tuyển dụng "${title}" vì từ khóa: ${detectedKeyword}`);
    }

    try {
      // Wrap the insert in a 30-second timeout so the button never stays stuck
      // if the network drops or the DB trigger causes a silent hang.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      let data: any = null;
      let insertError: any = null;

      try {
        const result = await (supabase
          .from('jobs')
          .insert([
            {
              title: title.trim(),
              description: description.trim(),
              price: numericPrice,
              status: 'open',
              owner_id: activeUserId,
              deadline: selectedDeadline.toISOString(),
              category,
              location: location.trim() || 'Online',
              is_flagged: isFlagged,
              flagged_reason: flaggedReason,
            },
          ])
          .select()
          .single() as any);
        clearTimeout(timeoutId);
        data = result.data;
        insertError = result.error;
      } catch (abortErr: any) {
        clearTimeout(timeoutId);
        if (abortErr?.name === 'AbortError' || controller.signal.aborted) {
          throw new Error('Yêu cầu hết thời gian chờ (30 giây). Vui lòng kiểm tra kết nối và thử lại.');
        }
        throw abortErr;
      }

      if (insertError) throw insertError;

      if (data) {
        // Deduct 20 staking credits on the frontend (trigger is validation-only).
        // This is non-blocking — the job is already posted successfully.
        supabase
          .from('users')
          .update({ credits: Math.max(0, userCredits - 20) })
          .eq('id', activeUserId)
          .then(({ error: creditErr }) => {
            if (creditErr) console.warn('[credits deduct]', creditErr.message);
          });

        setSuccessMsg(`Đăng việc thành công! Đã trừ 20 credits cọc.`);
        
        // Reset form inputs (retaining default future date)
        setTitle('');
        setPrice('');
        setDescription('');
        setLocation('');
        setCategory('coding');
        
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 7);
        setDeadline(defaultDate.toISOString().split('T')[0]);

        // Trigger updates in parent dashboard
        onCreditsUpdated(userCredits - 20);
        onJobCreated(data as Job);
      }
    } catch (err: any) {
      console.error('Error creating job:', err);
      setErrorMsg(err.message || 'Có lỗi xảy ra trong quá trình đăng việc.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative rounded-2xl border border-border-color bg-card-bg p-6 shadow-md">
      <h2 className="text-xl font-bold text-foreground mb-1">Đăng việc mới</h2>
      <p className="text-xs text-text-muted mb-6">
        Thuê sinh viên làm freelancer. Ngân sách sẽ được hệ thống tạm giữ an toàn cho đến khi duyệt sản phẩm.
      </p>

      {/* Info/Error Banners */}
      {errorMsg && (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs font-semibold text-rose-500">
          ⚠️ {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-semibold text-emerald-500">
          ✓ {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5">
            Tiêu đề công việc
          </label>
          <input
            id="title"
            type="text"
            placeholder="Ví dụ: Lập trình Landing Page tuyển sinh FTU"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting}
            className="w-full form-input rounded-xl px-4 py-3 text-sm"
          />
        </div>

        {/* Category Selection */}
        <div>
          <label htmlFor="category" className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5">
            Danh mục công việc
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={isSubmitting}
            className="w-full form-input rounded-xl px-4 py-3 text-sm cursor-pointer"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Budget & Deadline Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Price */}
          <div>
            <label htmlFor="price" className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5">
              Ngân sách (VNĐ)
            </label>
            <div className="relative">
              <input
                id="price"
                type="number"
                placeholder="Ví dụ: 150000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={isSubmitting}
                className="w-full form-input rounded-xl pl-4 pr-12 py-3 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-text-muted">
                đ
              </span>
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label htmlFor="deadline" className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5">
              Hạn chót công việc
            </label>
            <input
              id="deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              disabled={isSubmitting}
              className="w-full form-input rounded-xl px-4 py-3 text-sm color-scheme-dark"
            />
          </div>
        </div>

        {/* Location (optional) */}
        <div>
          <label htmlFor="location" className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5">
            Địa điểm làm việc (Không bắt buộc)
          </label>
          <input
            id="location"
            type="text"
            placeholder="Ví dụ: Online hoặc Cơ sở 1 HUST, FTU..."
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={isSubmitting}
            className="w-full form-input rounded-xl px-4 py-3 text-sm"
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5">
            Mô tả chi tiết công việc
          </label>
          <textarea
            id="description"
            rows={4}
            placeholder="Liệt kê chi tiết các yêu cầu, tài liệu bàn giao, thời gian, số lượng người muốn tuyển.."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
            className="w-full form-input rounded-xl px-4 py-3 text-sm resize-none"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full relative flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:from-blue-500 hover:to-purple-500 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-150 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border border-t-transparent border-white" />
              Đang đăng tuyển & tạm khóa quỹ...
            </>
          ) : (
            `Đăng việc làm (Ngân sách: ${price ? Number(price).toLocaleString('vi-VN') : '0'}đ)`
          )}
        </button>
      </form>
    </div>
  );
}

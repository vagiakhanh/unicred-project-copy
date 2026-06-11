'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface ReviewModalProps {
  isOpen: boolean;
  jobId: string;
  ratedUserId: string;
  onClose: () => void;
  onSubmitReview: (jobId: string, ratedUserId: string, stars: number, comment: string, proofUrl: string | null) => Promise<void>;
}

export default function ReviewModal({
  isOpen,
  jobId,
  ratedUserId,
  onClose,
  onSubmitReview,
}: ReviewModalProps) {
  const [stars, setStars] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setProofFile(e.target.files[0]);
      setErrorMsg('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // Bắt buộc phải upload ảnh minh chứng nếu đánh giá từ 2 sao trở xuống
    if (stars <= 2 && !proofFile) {
      return setErrorMsg('Bắt buộc phải tải lên ảnh minh chứng/báo cáo lỗi cho đánh giá dưới 3 sao.');
    }

    setIsSubmitting(true);

    try {
      let proofUrl = null;

      // 1. Kiểm tra và tải tệp minh chứng lên Supabase Storage nếu tồn tại
      if (proofFile) {
        const fileExt = proofFile.name.split('.').pop();
        const fileName = `${jobId}-${Date.now()}.${fileExt}`;
        const filePath = `proofs/${fileName}`;

        // Upload tệp vào bucket 'unicred-media'
        const { error: uploadError } = await supabase.storage
          .from('unicred-media')
          .upload(filePath, proofFile);

        if (uploadError) {
          console.warn('[Review Storage] Upload to unicred-media failed:', uploadError);
          throw new Error('Không thể tải tệp lên Supabase storage. Vui lòng đảm bảo bucket "unicred-media" đã được tạo và phân quyền public.');
        }

        // Bốc URL công khai từ Supabase Storage
        const { data } = supabase.storage
          .from('unicred-media')
          .getPublicUrl(filePath);

        proofUrl = data.publicUrl;
      }

      // 2. 🔥 ĐỒNG BỘ: Gửi đánh giá kèm theo link ảnh minh chứng (proofUrl) lên hệ thống Backend
      await onSubmitReview(jobId, ratedUserId, stars, comment.trim(), proofUrl);
      
      // Khởi tạo lại trạng thái ban đầu của form
      setStars(5);
      setComment('');
      setProofFile(null);
      onClose();
    } catch (err: any) {
      console.error('Error submitting rating:', err);
      setErrorMsg(err.message || 'Có lỗi xảy ra trong quá trình đánh giá.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay backdrop */}
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Box */}
      <div className="relative w-full max-w-md rounded-2xl border border-border-color bg-card-bg p-6 shadow-2xl animate-scale-in z-10">
        <h3 className="text-lg font-bold text-foreground mb-1">Đánh giá đối tác (Đánh giá ẩn)</h3>
        <p className="text-xs text-text-muted mb-6">
          Đánh giá của bạn sẽ được giữ kín hoàn toàn cho đến khi cả hai bên đánh giá xong, hoặc quá hạn 72h.
        </p>

        {errorMsg && (
          <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-500">
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Star selector */}
          <div className="flex flex-col items-center justify-center gap-2 py-2 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
              Chọn mức độ hài lòng
            </span>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => {
                    setStars(star);
                    setErrorMsg('');
                  }}
                  className="text-3xl hover:scale-110 active:scale-95 transition-transform duration-100 cursor-pointer focus:outline-none"
                >
                  {star <= stars ? '⭐' : '☆'}
                </button>
              ))}
            </div>
            <span className="text-xs font-bold text-amber-500 mt-1">
              {stars === 5 && '🔥 Xuất sắc / Vượt mong đợi'}
              {stars === 4 && '✨ Rất hài lòng / Đạt yêu cầu'}
              {stars === 3 && '👍 Tạm ổn / Vừa đủ'}
              {stars === 2 && '⚠️ Cần cải thiện / Trễ hạn'}
              {stars === 1 && '👎 Rất tệ / Không hoàn thành'}
            </span>
          </div>

          {/* Comment text area */}
          <div>
            <label htmlFor="comment" className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5">
              Nhận xét về đối tác
            </label>
            <textarea
              id="comment"
              rows={3}
              placeholder="Nhập nhận xét chi tiết về tác phong làm việc, chất lượng sản phẩm..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isSubmitting}
              className="w-full form-input rounded-xl px-4 py-3 text-sm resize-none"
            />
          </div>

          {/* Dispute Proof Upload Area (Conditional <= 2 stars) */}
          ={stars <= 2 && (
            <div className="rounded-xl border border-dashed border-rose-500/30 bg-rose-500/5 p-4 animate-fade-in">
              <label htmlFor="proof-upload" className="block text-xs font-bold uppercase tracking-wider text-rose-500 mb-1.5">
                Tải lên minh chứng (Bắt buộc)
              </label>
              <input
                id="proof-upload"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={isSubmitting}
                className="w-full text-xs text-text-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-rose-500/10 file:text-rose-500 hover:file:bg-rose-500/20 file:cursor-pointer"
              />
              <p className="text-[10px] text-text-muted mt-2">
                * Bắt buộc cung cấp minh chứng (ảnh chụp màn hình lỗi/trao đổi) để hỗ trợ quá trình khiếu nại.
              </p>
              {proofFile && (
                <div className="mt-2 text-[10px] text-emerald-600 dark:text-emerald-500 font-bold">
                  ✓ Đã chọn: {proofFile.name} ({(proofFile.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2 border-t border-border-color">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-border-color px-4 py-2.5 text-xs font-bold text-foreground hover:bg-border-color transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border border-t-transparent border-white" />
                  Đang gửi...
                </>
              ) : (
                'Gửi đánh giá'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
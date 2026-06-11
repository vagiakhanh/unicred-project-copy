'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface AppealModalProps {
  isOpen: boolean;
  onClose: () => void;
  reputationLogId: string;
  jobTitle: string;
  onSubmitAppeal: (reputationLogId: string, reason: string, proofUrl: string) => Promise<void>;
}

export default function AppealModal({
  isOpen,
  onClose,
  reputationLogId,
  jobTitle,
  onSubmitAppeal,
}: AppealModalProps) {
  const [reason, setReason] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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
    setSuccessMsg('');

    // Client-side validations
    if (reason.trim().length < 50) {
      return setErrorMsg(`Lý do khiếu nại quá ngắn! Bạn cần nhập ít nhất 50 ký tự (Hiện tại: ${reason.trim().length} ký tự).`);
    }

    if (!proofFile) {
      return setErrorMsg('Bắt buộc phải tải lên tệp ảnh minh chứng (ảnh chụp màn hình/báo cáo công việc).');
    }

    setIsSubmitting(true);

    try {
      // 1. Upload proof file to Supabase storage
      const fileExt = proofFile.name.split('.').pop();
      const fileName = `appeal-${reputationLogId}-${Date.now()}.${fileExt}`;
      const filePath = `appeals/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('unicred-media')
        .upload(filePath, proofFile);

      if (uploadError) {
        throw new Error('Không thể tải tệp minh chứng lên hệ thống lưu trữ. Vui lòng kiểm tra kết nối.');
      }

      const { data } = supabase.storage
        .from('unicred-media')
        .getPublicUrl(filePath);

      const proofUrl = data.publicUrl;

      // 2. Submit appeal
      await onSubmitAppeal(reputationLogId, reason.trim(), proofUrl);
      
      setSuccessMsg('Gửi khiếu nại thành công! Đang đóng băng điểm phạt và chờ admin duyệt.');
      setTimeout(() => {
        setReason('');
        setProofFile(null);
        onClose();
        setSuccessMsg('');
      }, 2000);
    } catch (err: any) {
      console.error('Error submitting appeal:', err);
      setErrorMsg(err.message || 'Có lỗi xảy ra khi nộp khiếu nại.');
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
        <h3 className="text-lg font-bold text-foreground mb-1">Gửi Khiếu Nại Điểm Phạt</h3>
        <p className="text-xs text-text-muted mb-6">
          Dự án: <span className="font-semibold text-foreground">{jobTitle}</span>
          <br />
          Khiếu nại giúp tạm đóng băng điểm phạt (Disputed_Frozen) loại bỏ khỏi uy tín công khai trong khi chờ Admin xét duyệt.
        </p>

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
          {/* Reason details */}
          <div>
            <label htmlFor="reason" className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5 flex justify-between">
              <span>Lý do khiếu nại chi tiết (Ít nhất 50 ký tự)</span>
              <span className={reason.trim().length >= 50 ? 'text-emerald-600' : 'text-rose-500'}>
                {reason.trim().length}/50
              </span>
            </label>
            <textarea
              id="reason"
              rows={4}
              placeholder="Giải trình rõ lý do vì sao đánh giá này không chính xác hoặc không công bằng. Nêu rõ các bằng chứng đi kèm..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSubmitting}
              className="w-full form-input rounded-xl px-4 py-3 text-sm resize-none"
            />
          </div>

          {/* Proof Upload Area */}
          <div className="rounded-xl border border-dashed border-border-color bg-slate-50 p-4">
            <label htmlFor="appeal-proof" className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5">
              Ảnh minh chứng / Tài liệu đối chứng (Bắt buộc)
            </label>
            <input
              id="appeal-proof"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isSubmitting}
              className="w-full text-xs text-text-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-indigo-500/10 file:text-indigo-600 hover:file:bg-indigo-500/20 file:cursor-pointer"
            />
            <p className="text-[10px] text-text-muted mt-2">
              * Tải lên ảnh chụp màn hình sản phẩm đã hoàn thành, hoặc đoạn hội thoại làm việc với đối tác.
            </p>
            {proofFile && (
              <div className="mt-2 text-[10px] text-emerald-600 font-bold">
                ✓ Đã chọn: {proofFile.name} ({(proofFile.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>

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
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border border-t-transparent border-white" />
                  Đang nộp khiếu nại...
                </>
              ) : (
                'Gửi khiếu nại'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

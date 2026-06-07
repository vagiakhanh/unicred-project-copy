'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [university, setUniversity] = useState('Đại học Bách Khoa Hà Nội (HUST)');
  const [major, setMajor] = useState('');
  const [cardFile, setCardFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCardFile(e.target.files[0]);
      setErrorMsg('');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // Validations
    if (!name.trim()) return setErrorMsg('Vui lòng nhập họ và tên.');
    if (!email.trim()) return setErrorMsg('Vui lòng nhập địa chỉ email.');
    
    // Strict Vietnamese University domain restriction (*.edu.vn)
    if (!email.toLowerCase().endsWith('.edu.vn')) {
      return setErrorMsg('Chỉ chấp nhận email sinh viên Việt Nam kết thúc bằng đuôi (.edu.vn) đăng ký tài khoản! Ví dụ: sinhvien@hust.edu.vn');
    }

    if (!password || password.length < 6) {
      return setErrorMsg('Mật khẩu đăng nhập phải có ít nhất 6 ký tự.');
    }
    if (!major.trim()) return setErrorMsg('Vui lòng nhập chuyên ngành đào tạo.');
    if (!cardFile) return setErrorMsg('Bắt buộc phải tải lên ảnh chụp Thẻ sinh viên để xác thực.');

    setIsSubmitting(true);
    console.log('[Signup] Bắt đầu đăng ký tài khoản cho email:', email.trim());

    try {
      // 1. First register Supabase Auth User
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError) {
        console.error('[Signup Error] Lỗi đăng ký auth.signUp từ Supabase:', JSON.stringify(authError, null, 2));
        throw authError;
      }

      console.log('[Signup] Đăng ký Supabase Auth thành công!', authData);
      
      const authUser = authData?.user;
      if (!authUser) {
        throw new Error('Đăng ký không thành công. Không nhận được thông tin người dùng từ Supabase.');
      }

      const activeSession = authData?.session;
      console.log('[Signup] Kiểm tra session nhận được:', activeSession);

      // If Supabase requires email confirmation, session is null here.
      // Storage upload needs an authenticated session — warn the user early
      // instead of letting the upload fail silently with an RLS error.
      if (!activeSession) {
        setSuccessMsg(
          'Tài khoản đã được tạo! Vui lòng kiểm tra hộp thư email học đường để xác nhận tài khoản. ' +
          'Sau khi xác nhận, hãy đăng nhập và tải thẻ sinh viên lên trong phần Hồ sơ cá nhân.'
        );
        return; // Stop here — upload requires an active session
      }

      // Simulated AI Card Verification Scan
      let flaggedReason: string | null = null;
      if (cardFile.name.toLowerCase().includes('fake') || cardFile.size < 10240) {
        flaggedReason = 'Phát hiện ảnh thẻ sinh viên nghi ngờ giả mạo hoặc kích thước quá nhỏ (AI Auto-Scan)';
        console.warn('[Signup AI Moderation] Gắn cờ nghi ngờ thẻ sinh viên:', cardFile.name, `${cardFile.size} bytes`);
      }

      // 2. Upload Student Card Image to Supabase Storage with dedicated try/catch
      let cardUrl = '';
      try {
        console.log('[Signup] Đang tải lên ảnh thẻ sinh viên lên Storage...');

        // Fix: Sanitize file extension — fall back to 'jpg' if undefined or empty,
        // and strip any characters that are not alphanumeric (prevents invalid paths).
        const rawExt = cardFile.name.includes('.')
          ? cardFile.name.split('.').pop() || 'jpg'
          : 'jpg';
        const fileExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';

        const fileName = `${authUser.id}-${Date.now()}.${fileExt}`;
        const filePath = `student-cards/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('unicred-media')
          .upload(filePath, cardFile, {
            contentType: cardFile.type || 'image/jpeg',
            upsert: false,
          });


        if (uploadError) {
          throw uploadError;
        }

        console.log('[Signup] Tải lên ảnh thẻ sinh viên lên Storage thành công!');
        const { data: publicUrlData } = supabase.storage
          .from('unicred-media')
          .getPublicUrl(filePath);

        cardUrl = publicUrlData?.publicUrl || '';
        console.log('[Signup] URL thẻ sinh viên công khai:', cardUrl);
      } catch (uploadErr: any) {
        console.error('[Signup Error] Chi tiết lỗi tải lên file thẻ sinh viên:', JSON.stringify(uploadErr, null, 2));
        const msg: string = uploadErr?.message || '';
        let friendlyMsg = `Lỗi tải lên thẻ sinh viên: ${msg}`;
        if (msg.toLowerCase().includes('bucket not found')) {
          friendlyMsg = 'Storage bucket "unicred-media" chưa được tạo. Vào Supabase Dashboard → Storage → New bucket → tên "unicred-media" → bật Public.';
        } else if (msg.toLowerCase().includes('row-level security') || msg.toLowerCase().includes('violates') || msg.toLowerCase().includes('not allowed')) {
          // RLS on storage.objects is blocking anonymous uploads.
          // Fix: run this SQL in Supabase SQL Editor:
          //   DROP POLICY IF EXISTS "Allow authenticated uploads to unicred-media" ON storage.objects;
          //   CREATE POLICY "Allow anon and auth uploads to unicred-media"
          //     ON storage.objects FOR INSERT
          //     WITH CHECK (bucket_id = 'unicred-media');
          friendlyMsg =
            'Lỗi quyền truy cập Storage (RLS). Vào Supabase Dashboard → Storage → unicred-media → Policies ' +
            'và thêm policy INSERT cho role "anon" và "authenticated", hoặc chạy lệnh SQL fix trong schema.sql.';
        }
        throw new Error(friendlyMsg);
      }

      // 3. Update the profile row created by the database trigger
      console.log('[Signup] Đang cập nhật thông tin chi tiết vào bảng public.users...');
      const { data: updatedData, error: profileError } = await supabase
        .from('users')
        .update({
          name: name.trim(),
          university,
          major: major.trim(),
          student_card_url: cardUrl,
          flagged_reason: flaggedReason,
        })
        .eq('id', authUser.id)
        .select()
        .maybeSingle();

      if (profileError) {
        console.error('[Signup Error] Lỗi cập nhật hồ sơ users:', JSON.stringify(profileError, null, 2));
        throw profileError;
      }

      // If the trigger did not create the row (fallback)
      if (!updatedData) {
        console.warn('[Signup] Không tìm thấy hàng hồ sơ được tạo bởi trigger, tiến hành chèn thủ công...');
        const { error: insertError } = await supabase
          .from('users')
          .insert([
            {
              id: authUser.id,
              email: email.trim(),
              name: name.trim(),
              university,
              major: major.trim(),
              student_card_url: cardUrl,
              is_verified: false,
              credits: 500000,
              reputation: 100,
              flagged_reason: flaggedReason,
            },
          ]);

        if (insertError) {
          console.error('[Signup Error] Lỗi chèn hồ sơ thủ công:', JSON.stringify(insertError, null, 2));
          throw insertError;
        }
      }

      console.log('[Signup] Lưu thông tin hồ sơ vào database thành công!');

      // 4. Handle session checking and redirection
      if (activeSession) {
        console.log('[Signup] Nhận được session hợp lệ. Đang chuyển hướng về trang chủ...');
        setSuccessMsg('Đăng ký thành công! Đang tự động đăng nhập và chuyển hướng...');
        setTimeout(() => {
          router.push('/');
        }, 1500);
      } else {
        console.log('[Signup] Session là null. Yêu cầu người dùng xác nhận email.');
        setSuccessMsg('Đăng ký tài khoản thành công! Vui lòng kiểm tra hộp thư email học đường của bạn để xác nhận tài khoản trước khi đăng nhập.');
      }

    } catch (err: any) {
      console.error('[Signup Error] Lỗi tổng thể trong luồng đăng ký:', JSON.stringify(err, null, 2));
      setErrorMsg(err.message || 'Đăng ký thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      console.log('[Signup] Luồng xử lý hoàn tất, tắt trạng thái loading.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      {/* Subtle Glow Effects */}
      <div className="absolute top-10 left-10 h-72 w-72 rounded-full bg-indigo-500/5 blur-3xl -z-10" />
      <div className="absolute bottom-10 right-10 h-72 w-72 rounded-full bg-purple-500/5 blur-3xl -z-10" />

      <div className="w-full max-w-md rounded-2xl border border-border-color bg-card-bg p-8 shadow-card">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl font-black text-white shadow-lg mb-3">
            U
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Đăng ký thành viên</h1>
          <p className="text-xs text-text-muted mt-1.5">
            Gia nhập cộng đồng chợ vi việc làm dành riêng cho sinh viên Việt Nam.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs font-semibold text-rose-600 dark:text-rose-500">
            ⚠️ {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-semibold text-emerald-600 dark:text-emerald-500">
            ✓ {successMsg}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          {/* Full Name */}
          <div>
            <label htmlFor="name" className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
              Họ và tên
            </label>
            <input
              id="name"
              type="text"
              required
              placeholder="Nhập họ tên đầy đủ của bạn"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className="w-full form-input rounded-xl px-4 py-3 text-sm"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
              Email Sinh Viên (.edu.vn)
            </label>
            <input
              id="email"
              type="email"
              required
              placeholder="sinhvien@school.edu.vn"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              className="w-full form-input rounded-xl px-4 py-3 text-sm"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              required
              placeholder="Tối thiểu 6 ký tự"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              className="w-full form-input rounded-xl px-4 py-3 text-sm"
            />
          </div>

          {/* University selection */}
          <div>
            <label htmlFor="university" className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
              Trường Đại học
            </label>
            <select
              id="university"
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
              disabled={isSubmitting}
              className="w-full form-input rounded-xl px-4 py-3 text-sm cursor-pointer"
            >
              <option value="Đại học Bách Khoa Hà Nội (HUST)">Đại học Bách Khoa Hà Nội (HUST)</option>
              <option value="Đại học Ngoại Thương (FTU)">Đại học Ngoại Thương (FTU)</option>
              <option value="Đại học Kinh Tế Quốc Dân (NEU)">Đại học Kinh Tế Quốc Dân (NEU)</option>
              <option value="Đại học Quốc gia Hà Nội (VNU)">Đại học Quốc gia Hà Nội (VNU)</option>
              <option value="Đại học Quốc gia TP.HCM (VNU-HCM)">Đại học Quốc gia TP.HCM (VNU-HCM)</option>
              <option value="Khác">Trường đại học khác</option>
            </select>
          </div>

          {/* Major */}
          <div>
            <label htmlFor="major" className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
              Chuyên ngành đào tạo
            </label>
            <input
              id="major"
              type="text"
              required
              placeholder="Ví dụ: Công nghệ thông tin, Kinh tế đối ngoại..."
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              disabled={isSubmitting}
              className="w-full form-input rounded-xl px-4 py-3 text-sm"
            />
          </div>

          {/* Student Card File */}
          <div>
            <label htmlFor="card-upload" className="block text-[10px] font-black uppercase tracking-wider text-text-muted mb-1.5">
              Ảnh chụp thẻ sinh viên (Bắt buộc)
            </label>
            <input
              id="card-upload"
              type="file"
              required
              accept="image/*"
              onChange={handleFileChange}
              disabled={isSubmitting}
              className="w-full text-xs text-text-muted file:mr-3 file:py-2.5 file:px-3 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 file:cursor-pointer"
            />
            {cardFile && (
              <div className="mt-2 text-[10px] text-emerald-600 dark:text-emerald-500 font-bold">
                ✓ Đã chọn file: {cardFile.name} ({(cardFile.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full relative flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-3 text-sm font-bold text-white shadow-lg hover:from-blue-500 hover:to-purple-500 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none transition-all duration-150 cursor-pointer mt-6 shadow-md"
          >
            {isSubmitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border border-t-transparent border-white" />
                Đang tạo tài khoản & lưu thẻ...
              </>
            ) : (
              'Đăng ký tài khoản'
            )}
          </button>
        </form>

        <div className="text-center mt-6 text-xs text-text-muted">
          Đã có tài khoản?{' '}
          <Link href="/login" className="font-bold text-indigo-600 hover:underline">
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    </div>
  );
}

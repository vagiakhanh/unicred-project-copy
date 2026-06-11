import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: NextRequest) {
  try {
    const { jobId, raterId, ratedUserId, stars, comment, proofUrl } = await req.json();

    if (!jobId || !stars || !raterId || !ratedUserId) {
      return NextResponse.json({ success: false, message: 'Thiếu thông tin bắt buộc.' }, { status: 400 });
    }

    const currentStars = Number(stars);

    // 🌟 BƯỚC 1: Tìm kiếm xem đối tác trước đó đã đánh giá chưa
    const { data: partnerReviews, error: partnerError } = await supabase
      .from('reputation_logs')
      .select('*')
      .eq('job_id', jobId)
      .eq('rater_id', ratedUserId);

    if (partnerError) throw partnerError;
    const partnerReview = partnerReviews && partnerReviews.length > 0 ? partnerReviews[0] : null;

    // 👉 TRƯỜNG HỢP A: Bạn là người đánh giá ĐẦU TIÊN
    if (!partnerReview) {
      // 1. Cho phép người đầu tiên lưu vào nhật ký hệ thống bình thường
      const { data: ratingData, error: ratingError } = await supabase
        .from('reputation_logs')
        .insert([{
          job_id: jobId,
          rater_id: raterId,
          rated_user_id: ratedUserId,
          stars: currentStars,
          comment: comment || '',
          proof_image_url: proofUrl || null,
        }])
        .select()
        .maybeSingle();

      if (ratingError) throw ratingError;

      // Nếu người đầu tiên chấm tệ (<= 2 sao), chuyển trạng thái Job sang 'disputed' sẵn để phòng vệ đơn phương
      if (currentStars <= 2) {
        await supabase.from('jobs').update({ payout_status: 'disputed' }).eq('id', jobId);
        
        await supabase.from('appeals').insert([
          {
            user_id: ratedUserId,
            reputation_log_id: ratingData?.id,
            proof_image_url: proofUrl || null,
            reason: `Tranh chấp đơn phương: Người đánh giá trước cấp số sao thấp (${currentStars} sao). Nội dung: ${comment || 'Không để lại lý do.'}`,
            status: 'pending'
          }
        ]);
      }
      return NextResponse.json({ success: true, message: 'Đã ghi nhận đánh giá đầu tiên thành công!' });
    }

    // 👉 TRƯỜNG HỢP B: BẠN LÀ NGƯỜI ĐÁNH GIÁ THỨ HAI (Nút thắt quyết định dòng tiền)
    const partnerStars = Number(partnerReview.stars);

    // 🛑 CHẶN ĐỨNG: Nếu phát hiện có tranh chấp (bạn chấm <= 2 hoặc người trước chấm <= 2)
    if (currentStars <= 2 || partnerStars <= 2) {
      
      // 1. Ép trạng thái Job thành 'disputed' đóng băng bảo chứng dòng tiền cọc lập tức
      await supabase.from('jobs').update({ payout_status: 'disputed' }).eq('id', jobId);

      // 2. 🚀 ĐÒN QUYẾT ĐỊNH: Tuyệt đối KHÔNG INSERT bản ghi thứ hai vào bảng 'reputation_logs'
      // Việc này giúp Database chỉ đếm thấy 1 bản ghi -> Bẻ gãy hoàn toàn Trigger tự động nhả tiền thưởng/hoàn cọc ngầm!
      
      const finalProofImageUrl = proofUrl || partnerReview.proof_image_url || null;

      // Kiểm tra xem lượt đánh giá thứ nhất đã sinh đơn khiếu nại nào chưa
      const { data: existingAppeals } = await supabase
        .from('appeals')
        .select('id')
        .eq('reputation_log_id', partnerReview.id);
      
      if (existingAppeals && existingAppeals.length > 0) {
        // Nếu đã có đơn từ trước, cập nhật đầy đủ lý do song phương và ảnh minh chứng mới nhất lên Admin Portal
        await supabase.from('appeals').update({
          reason: `Tranh chấp song phương: Xuất hiện đánh giá tiêu cực (Bên trước: ${partnerStars} sao, Bên sau gửi qua API: ${currentStars} sao). Nhận xét bên sau: ${comment || 'Không để lại lý do.'}`,
          status: 'Disputed_Frozen',
          proof_image_url: finalProofImageUrl
        }).eq('reputation_log_id', partnerReview.id);
      } else {
        // Nếu chưa có, tạo mới một đơn khiếu nại dính chặt vào log của người thứ nhất để đẩy lên Admin Portal
        await supabase.from('appeals').insert([
          {
            user_id: ratedUserId, 
            reputation_log_id: partnerReview.id, // Đính vào log người thứ nhất
            proof_image_url: finalProofImageUrl,
            reason: `Tranh chấp song phương: Xuất hiện đánh giá tiêu cực (Bên trước: ${partnerStars} sao, Bên sau gửi qua API: ${currentStars} sao). Nhận xét bên sau: ${comment || 'Không để lại lý do.'}`,
            status: 'Disputed_Frozen'
          }
        ]);
      }

      return NextResponse.json({ success: true, message: 'Phát hiện đánh giá tiêu cực. Dòng tiền cọc và thưởng đã bị khóa cứng tại Escrow và chuyển về cổng Admin Portal!' });

    } else {
      // 🟢 LUỒNG ĐÁNH GIÁ TỐT SONG PHƯƠNG (Cả hai đều chấm > 2 sao)
      // Cho phép insert bản ghi thứ hai để kích hoạt Trigger Database tự động hoàn cọc và phát thưởng hợp lệ
      const { error: ratingError } = await supabase
        .from('reputation_logs')
        .insert([{
          job_id: jobId,
          rater_id: raterId,
          rated_user_id: ratedUserId,
          stars: currentStars,
          comment: comment || '',
        }]);

      if (ratingError) throw ratingError;

      // Thực hiện logic cộng tiền Next.js dự phòng song song với DB
      const { data: jobData } = await supabase.from('jobs').select('owner_id').eq('id', jobId).single();
      if (jobData) {
        const { data: userData } = await supabase.from('users').select('credits').eq('id', jobData.owner_id).single();
        if (userData) {
          await supabase.from('users').update({ credits: userData.credits + 30 }).eq('id', jobData.owner_id);
        }
      }
      await supabase.from('jobs').update({ payout_status: 'released' }).eq('id', jobId);

      return NextResponse.json({ success: true, message: 'Giao dịch hoàn tất! Hệ thống tự động hoàn cọc và cộng thưởng.' });
    }

  } catch (error: any) {
    console.error('[Review API Error]:', error);
    return NextResponse.json({ success: false, message: error.message || 'Lỗi máy chủ nội bộ.' }, { status: 500 });
  }
}
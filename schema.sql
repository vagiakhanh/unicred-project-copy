-- =======================================================
-- UNICRED: CHỢ VIỆC LÀM SINH VIÊN VIỆT NAM (SCHEMA UPDATE)
-- CREDIT-BASED TRUST PLATFORM (NO REAL MONEY)
-- =======================================================
-- Run these queries in the Supabase SQL Editor to set up the database!

-- Cleanup existing tables in reverse-relationship order
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS appeals CASCADE;
DROP TABLE IF EXISTS reputation_logs CASCADE;
DROP TABLE IF EXISTS credit_logs CASCADE;
DROP TABLE IF EXISTS contracts CASCADE;
DROP TABLE IF EXISTS job_applications CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Create Public Users Table
-- References Supabase auth.users(id) for secure authentications
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  university TEXT,
  major TEXT,
  avatar_url TEXT,
  bio TEXT,
  credits INTEGER DEFAULT 100, -- Staking credits (deducted 20 on post/claim, refunded +10 on complete)
  so_du INTEGER DEFAULT 0,     -- VND budget pool (job budget deducted here on post)
  trust_score INTEGER DEFAULT 0, -- Default 0 trust score
  freelancer_reputation INTEGER DEFAULT 100 CHECK (freelancer_reputation BETWEEN 0 AND 100),
  client_reputation INTEGER DEFAULT 100 CHECK (client_reputation BETWEEN 0 AND 100),
  reputation INTEGER DEFAULT 100, -- For legacy/fallback compatibility
  is_verified BOOLEAN DEFAULT false,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_banned BOOLEAN DEFAULT false,
  flagged_reason TEXT,
  student_card_url TEXT,
  facebook_url TEXT,
  instagram_url TEXT
);

-- 2. Create Jobs Table
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL DEFAULT 0,           -- Job budget in VND
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  assigned_worker_id UUID REFERENCES users(id) ON DELETE SET NULL,
  client_approved BOOLEAN DEFAULT false,
  worker_approved BOOLEAN DEFAULT false,
  category TEXT NOT NULL, -- e.g. coding, design, writing, translation, video, others
  location TEXT, -- e.g. Remote, FTU, HUST, etc.
  deadline TIMESTAMP WITH TIME ZONE,
  is_flagged BOOLEAN DEFAULT false,
  flagged_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Job Applications Table
CREATE TABLE job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(job_id, user_id)
);

-- 4. Create Contracts Table (Bound relationship of hire for backward-compatibility)
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  UNIQUE(job_id)
);

-- 5. Create Credit Logs Table (Virtual Economy Transactions)
CREATE TABLE credit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL, -- e.g. job_post_stake, job_accept_stake, job_completed_refund_bonus, job_cancelled_forfeit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Create Reputation Logs Table (Rating review system + Blind review)
CREATE TABLE reputation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  rater_id UUID REFERENCES users(id) ON DELETE CASCADE,
  rated_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment TEXT,
  proof_image_url TEXT, -- Low rating proof image
  is_visible_to_public BOOLEAN DEFAULT false, -- Starts false for blind review
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(job_id, rater_id)
);

-- 7. Create Appeals Table (Appeals System for ratings/penalties)
CREATE TABLE appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  reputation_log_id UUID REFERENCES reputation_logs(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  proof_image_url TEXT NOT NULL, -- Required attachment proof
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Disputed_Frozen', 'Finalized')),
  admin_comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =======================================================
-- MESSAGING & CONVERSATIONS TABLES
-- =======================================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(job_id, worker_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  seen BOOLEAN DEFAULT false,
  seen_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);

-- =======================================================
-- NOTIFICATION SYSTEM
-- =======================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  type TEXT,
  content TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);

-- =======================================================
-- INDEXES FOR SCALE & SPEED
-- =======================================================
CREATE INDEX IF NOT EXISTS idx_jobs_owner_id ON jobs(owner_id);
CREATE INDEX IF NOT EXISTS idx_jobs_worker_id ON jobs(assigned_worker_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_job_id ON job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_user_id ON job_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_job_id ON contracts(job_id);
CREATE INDEX IF NOT EXISTS idx_contracts_worker_id ON contracts(worker_id);
CREATE INDEX IF NOT EXISTS idx_credit_logs_user_id ON credit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_reputation_logs_job_id ON reputation_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_reputation_logs_rated_user_id ON reputation_logs(rated_user_id);
CREATE INDEX IF NOT EXISTS idx_appeals_user_id ON appeals(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- =======================================================
-- TRIGGERS & PROCEDURES (BUSINESS LOGIC)
-- =======================================================

-- 1. Auto user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (
    id, email, name, university, major, credits, so_du, trust_score, 
    freelancer_reputation, client_reputation, reputation, is_verified, role, is_banned
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(split_part(new.email, '@', 1), 'Sinh Viên'),
    'Đại học Bách Khoa Hà Nội (HUST)',
    'Chưa cập nhật',
    100, -- default 100 staking credits
    0,   -- default 0 so_du (VND budget pool)
    0,   -- default 0 trust score
    100, -- default 100 reputation
    100,
    100,
    false,
    'user',
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Deduct 20 credits from client when job is posted + deduct job budget from so_du
CREATE OR REPLACE FUNCTION check_job_post_credits()
RETURNS trigger AS $$
DECLARE
  v_credits INTEGER;
  v_so_du   INTEGER;
BEGIN
  SELECT credits, so_du INTO v_credits, v_so_du FROM users WHERE id = NEW.owner_id;

  -- Check staking credits
  IF v_credits < 20 THEN
    RAISE EXCEPTION 'Số dư credits của bạn không đủ để đăng việc (cần 20 credits cọc, hiện tại bạn có %).', v_credits;
  END IF;

  -- Check so_du covers job budget
  IF v_so_du < NEW.price THEN
    RAISE EXCEPTION 'Số dư không đủ để đăng việc (cần % đ, hiện tại bạn có % đ).', NEW.price, v_so_du;
  END IF;

  -- Deduct 20 staking credits
  UPDATE users SET credits = credits - 20 WHERE id = NEW.owner_id;
  INSERT INTO credit_logs (user_id, amount, type)
  VALUES (NEW.owner_id, -20, 'job_post_stake');

  -- Deduct job budget from so_du
  UPDATE users SET so_du = so_du - NEW.price WHERE id = NEW.owner_id;
  INSERT INTO credit_logs (user_id, amount, type)
  VALUES (NEW.owner_id, -NEW.price, 'job_post_budget');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_job_post_credits ON jobs;
CREATE TRIGGER trg_check_job_post_credits
  BEFORE INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION check_job_post_credits();

-- 3. Deduct 20 credits from freelancer when job application is accepted (Staking Mechanism)
CREATE OR REPLACE FUNCTION check_job_accept_credits()
RETURNS trigger AS $$
DECLARE
  v_credits INTEGER;
BEGIN
  IF NEW.assigned_worker_id IS NOT NULL AND (OLD.assigned_worker_id IS NULL OR OLD.assigned_worker_id != NEW.assigned_worker_id) THEN
    SELECT credits INTO v_credits FROM users WHERE id = NEW.assigned_worker_id;
    IF v_credits < 20 THEN
      RAISE EXCEPTION 'Số dư credits của ứng viên không đủ để nhận việc (cần 20 credits cọc).';
    END IF;
    
    -- Deduct 20 staking credits from worker
    UPDATE users SET credits = credits - 20 WHERE id = NEW.assigned_worker_id;
    
    -- Log
    INSERT INTO credit_logs (user_id, amount, type)
    VALUES (NEW.assigned_worker_id, -20, 'job_accept_stake');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_job_accept_credits ON jobs;
CREATE TRIGGER trg_check_job_accept_credits
  BEFORE UPDATE OF assigned_worker_id ON jobs
  FOR EACH ROW EXECUTE FUNCTION check_job_accept_credits();

-- 4. Automatically mark job completed when both parties approve
CREATE OR REPLACE FUNCTION check_job_completion_approval()
RETURNS trigger AS $$
BEGIN
  IF NEW.client_approved = true AND NEW.worker_approved = true AND NEW.status = 'in_progress' THEN
    NEW.status := 'completed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_job_completion_approval ON jobs;
CREATE TRIGGER trg_check_job_completion_approval
  BEFORE UPDATE OF client_approved, worker_approved ON jobs
  FOR EACH ROW EXECUTE FUNCTION check_job_completion_approval();

-- 5. Handle refunds + bonuses on job completion or cancellation
CREATE OR REPLACE FUNCTION handle_job_status_change()
RETURNS trigger AS $$
BEGIN
  -- Job Completed
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Client gets back 20 stake + 10 bonus = 30 credits
    UPDATE users SET credits = credits + 30 WHERE id = NEW.owner_id;
    INSERT INTO credit_logs (user_id, amount, type)
    VALUES (NEW.owner_id, 30, 'job_completed_refund_bonus');
    UPDATE users SET trust_score = trust_score + 1 WHERE id = NEW.owner_id;

    -- Worker gets back 20 stake + 10 bonus = 30 credits
    IF NEW.assigned_worker_id IS NOT NULL THEN
      UPDATE users SET credits = credits + 30 WHERE id = NEW.assigned_worker_id;
      INSERT INTO credit_logs (user_id, amount, type)
      VALUES (NEW.assigned_worker_id, 30, 'job_completed_refund_bonus');
      UPDATE users SET trust_score = trust_score + 1 WHERE id = NEW.assigned_worker_id;
      
      -- Set contract status to completed if exists
      UPDATE contracts SET status = 'completed' WHERE job_id = NEW.id;
    END IF;

  -- Job Cancelled
  ELSIF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    -- No credit refunds. Staked credits are forfeited.
    -- Reduce trust score as penalty
    UPDATE users SET trust_score = GREATEST(0, trust_score - 1) WHERE id = NEW.owner_id;
    IF NEW.assigned_worker_id IS NOT NULL THEN
      UPDATE users SET trust_score = GREATEST(0, trust_score - 1) WHERE id = NEW.assigned_worker_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_handle_job_status_change ON jobs;
CREATE TRIGGER trg_handle_job_status_change
  AFTER UPDATE OF status ON jobs
  FOR EACH ROW EXECUTE FUNCTION handle_job_status_change();

-- 6. Blind Review System visibility update
CREATE OR REPLACE FUNCTION update_reputation_visibility()
RETURNS trigger AS $$
DECLARE
  v_matching_id UUID;
BEGIN
  -- Check if there's a matching rating from the other side
  SELECT id INTO v_matching_id FROM reputation_logs
  WHERE job_id = NEW.job_id
    AND rater_id = NEW.rated_user_id
    AND rated_user_id = NEW.rater_id;

  IF v_matching_id IS NOT NULL THEN
    -- Both have reviewed, publish both reviews
    NEW.is_visible_to_public := true;
    
    UPDATE reputation_logs
    SET is_visible_to_public = true
    WHERE id = v_matching_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_reputation_visibility ON reputation_logs;
CREATE TRIGGER trg_update_reputation_visibility
  BEFORE INSERT ON reputation_logs
  FOR EACH ROW EXECUTE FUNCTION update_reputation_visibility();

-- 7. Calculate and update client/freelancer reputation scores
CREATE OR REPLACE FUNCTION recalculate_user_reputation(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_freelancer_avg INTEGER;
  v_client_avg INTEGER;
BEGIN
  -- Freelancer reputation (average stars * 20 where user was freelancer, review is public, and no active/pending Disputed_Frozen appeal)
  SELECT COALESCE(ROUND(AVG(stars) * 20), 100)
  INTO v_freelancer_avg
  FROM reputation_logs r
  JOIN jobs j ON j.id = r.job_id
  WHERE r.rated_user_id = p_user_id
    AND j.owner_id != p_user_id
    AND r.is_visible_to_public = true
    AND NOT EXISTS (
      SELECT 1 FROM appeals a
      WHERE a.reputation_log_id = r.id
        AND a.status = 'Disputed_Frozen'
    );

  -- Client reputation (average stars * 20 where user was employer, review is public, and no active/pending Disputed_Frozen appeal)
  SELECT COALESCE(ROUND(AVG(stars) * 20), 100)
  INTO v_client_avg
  FROM reputation_logs r
  JOIN jobs j ON j.id = r.job_id
  WHERE r.rated_user_id = p_user_id
    AND j.owner_id = p_user_id
    AND r.is_visible_to_public = true
    AND NOT EXISTS (
      SELECT 1 FROM appeals a
      WHERE a.reputation_log_id = r.id
        AND a.status = 'Disputed_Frozen'
    );

  -- Update user profile
  UPDATE users
  SET freelancer_reputation = v_freelancer_avg,
      client_reputation = v_client_avg,
      reputation = v_freelancer_avg
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to recalculate reputation when a log is added or visibility changes
CREATE OR REPLACE FUNCTION trg_recalculate_reputation_from_log()
RETURNS trigger AS $$
BEGIN
  PERFORM recalculate_user_reputation(NEW.rated_user_id);
  IF TG_OP = 'UPDATE' AND OLD.rated_user_id != NEW.rated_user_id THEN
    PERFORM recalculate_user_reputation(OLD.rated_user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_recalc_reputation_log ON reputation_logs;
CREATE TRIGGER trg_recalc_reputation_log
  AFTER INSERT OR UPDATE OF stars, is_visible_to_public, rated_user_id ON reputation_logs
  FOR EACH ROW EXECUTE FUNCTION trg_recalculate_reputation_from_log();

-- Trigger to recalculate reputation when an appeal is updated (frozen or resolved)
CREATE OR REPLACE FUNCTION trg_recalculate_reputation_from_appeal()
RETURNS trigger AS $$
DECLARE
  v_rated_user_id UUID;
BEGIN
  SELECT rated_user_id INTO v_rated_user_id
  FROM reputation_logs
  WHERE id = NEW.reputation_log_id;

  IF v_rated_user_id IS NOT NULL THEN
    PERFORM recalculate_user_reputation(v_rated_user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_recalc_reputation_appeal ON appeals;
CREATE TRIGGER trg_recalc_reputation_appeal
  AFTER INSERT OR UPDATE OF status ON appeals
  FOR EACH ROW EXECUTE FUNCTION trg_recalculate_reputation_from_appeal();

-- 8. Appeal Submission Constraints (SLA 72h, text length >= 50, attachment check, max 3/month)
CREATE OR REPLACE FUNCTION check_appeal_constraints()
RETURNS trigger AS $$
DECLARE
  v_appeal_count INTEGER;
  v_created_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Check reason length
  IF char_length(NEW.reason) < 50 THEN
    RAISE EXCEPTION 'Nội dung khiếu nại phải có ít nhất 50 ký tự.';
  END IF;

  -- Check proof image
  IF NEW.proof_image_url IS NULL OR NEW.proof_image_url = '' THEN
    RAISE EXCEPTION 'Vui lòng cung cấp minh chứng hình ảnh/tài liệu đính kèm.';
  END IF;

  -- Check SLA 72h
  SELECT created_at INTO v_created_at FROM reputation_logs WHERE id = NEW.reputation_log_id;
  IF v_created_at IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy đánh giá tương ứng để khiếu nại.';
  END IF;
  
  IF v_created_at < now() - INTERVAL '72 hours' THEN
    RAISE EXCEPTION 'Đã quá hạn 72 giờ để gửi khiếu nại đối với đánh giá này.';
  END IF;

  -- Check user limits (3 appeals/user/month)
  SELECT COUNT(*) INTO v_appeal_count
  FROM appeals
  WHERE user_id = NEW.user_id
    AND created_at >= date_trunc('month', now());
    
  IF v_appeal_count >= 3 THEN
    RAISE EXCEPTION 'Bạn đã vượt quá số lượt khiếu nại tối đa trong tháng này (Tối đa 3 lượt).';
  END IF;

  -- Default status when submitted
  NEW.status := 'Disputed_Frozen';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_appeal_constraints ON appeals;
CREATE TRIGGER trg_check_appeal_constraints
  BEFORE INSERT ON appeals
  FOR EACH ROW EXECUTE FUNCTION check_appeal_constraints();

-- 9. Cron Job / Time-locked task runner (SLA 72h locks)
-- Runs periodically to close expired appeals and hide one-way reviews
CREATE OR REPLACE FUNCTION finalize_expired_appeals_and_reviews()
RETURNS void AS $$
BEGIN
  -- Finalize pending/disputed appeals older than 72 hours
  UPDATE appeals 
  SET status = 'Finalized', 
      admin_comment = COALESCE(admin_comment, 'Tự động đóng do quá thời hạn khiếu nại 72 giờ')
  WHERE status IN ('Pending', 'Disputed_Frozen') 
    AND created_at < now() - INTERVAL '72 hours';

  -- Finalize reputation logs. If one-way review has been sitting for > 72 hours,
  -- it will stay is_visible_to_public = false forever. No action needed other than keeping it false.
  -- But we run recalculation on users whose appeals were finalized to apply the rating penalty
  -- (since they transition from Disputed_Frozen to Finalized, the reputation recalculates)
  -- The trg_recalc_reputation_appeal trigger will automatically run on those updates.
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Message notification trigger
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger AS $$
DECLARE
  v_recipient_id UUID;
  v_sender_name TEXT;
BEGIN
  SELECT CASE 
    WHEN j.owner_id = NEW.sender_id THEN c.worker_id
    ELSE j.owner_id
  END INTO v_recipient_id
  FROM conversations c
  JOIN jobs j ON j.id = c.job_id
  WHERE c.id = NEW.conversation_id;

  SELECT COALESCE(name, split_part(email, '@', 1)) INTO v_sender_name
  FROM users
  WHERE id = NEW.sender_id;

  IF v_recipient_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, conversation_id, type, content)
    VALUES (
      v_recipient_id,
      NEW.conversation_id,
      'message',
      'Bạn có tin nhắn mới từ ' || COALESCE(v_sender_name, 'Sinh Viên')
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS message_notification ON messages;
CREATE TRIGGER message_notification
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();

-- =======================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =======================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- users policies
CREATE POLICY "Allow public read users" ON users FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- jobs policies
CREATE POLICY "Allow public read jobs" ON jobs FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert jobs" ON jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Allow update own jobs" ON jobs FOR UPDATE USING (auth.uid() = owner_id OR assigned_worker_id = auth.uid() OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Allow delete own jobs" ON jobs FOR DELETE USING (auth.uid() = owner_id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- job_applications policies
CREATE POLICY "Allow read all applications" ON job_applications FOR SELECT USING (true);
CREATE POLICY "Allow insert own applications" ON job_applications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow delete own applications" ON job_applications FOR DELETE USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- contracts policies
CREATE POLICY "Allow read contracts" ON contracts FOR SELECT USING (true);
-- INSERT: any authenticated user can create a contract (app code enforces the owner check)
CREATE POLICY "Allow insert own contracts" ON contracts FOR INSERT TO authenticated WITH CHECK (true);
-- UPDATE: worker on the contract or admin only
CREATE POLICY "Allow update own contracts" ON contracts FOR UPDATE USING (
  worker_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- credit_logs policies
CREATE POLICY "Users can view own credit logs" ON credit_logs FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
-- INSERT is permitted unconditionally because credit_logs are written exclusively
-- by SECURITY DEFINER triggers (check_job_post_credits, check_job_accept_credits,
-- handle_job_status_change). No client code ever inserts directly.
-- Without this policy, the trigger INSERT can be blocked in some Supabase
-- connection-pooler configurations (PgBouncer transaction mode), rolling back
-- the outer jobs INSERT silently and leaving the JS promise unresolved → button stuck.
CREATE POLICY "Allow system insert credit logs" ON credit_logs FOR INSERT WITH CHECK (true);

-- reputation_logs policies
CREATE POLICY "Users can view public or related reputation logs" ON reputation_logs FOR SELECT USING (
  is_visible_to_public = true OR 
  auth.uid() = rater_id OR 
  auth.uid() = rated_user_id OR 
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can insert own reputation logs" ON reputation_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = rater_id);

-- appeals policies
CREATE POLICY "Users can view own appeals or admin" ON appeals FOR SELECT USING (
  auth.uid() = user_id OR 
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can insert own appeals" ON appeals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin can update appeals" ON appeals FOR UPDATE USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- conversations policies
CREATE POLICY "Allow select conversations for participants" ON conversations FOR SELECT USING (
  EXISTS (SELECT 1 FROM jobs j WHERE j.id = conversations.job_id AND j.owner_id = auth.uid()) OR 
  worker_id = auth.uid() OR
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Allow insert conversations for participants" ON conversations FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM jobs j WHERE j.id = conversations.job_id AND j.owner_id = auth.uid()) OR 
  worker_id = auth.uid()
);

-- messages policies
CREATE POLICY "Participants can read messages" ON messages FOR SELECT USING (
  sender_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM conversations c
    JOIN jobs j ON j.id = c.job_id
    WHERE c.id = messages.conversation_id
      AND (j.owner_id = auth.uid() OR c.worker_id = auth.uid())
  ) OR
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Participants can insert messages" ON messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND 
  EXISTS (
    SELECT 1 FROM conversations c
    JOIN jobs j ON j.id = c.job_id
    WHERE c.id = messages.conversation_id
      AND (j.owner_id = auth.uid() OR c.worker_id = auth.uid())
  )
);
CREATE POLICY "Participants can update messages seen status" ON messages FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM conversations c
    JOIN jobs j ON j.id = c.job_id
    WHERE c.id = messages.conversation_id
      AND (j.owner_id = auth.uid() OR c.worker_id = auth.uid())
  )
);

-- notifications policies
CREATE POLICY "Allow select own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Allow update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- =======================================================
-- STORAGE: Create unicred-media bucket for student card uploads
-- =======================================================
-- Run this block if the bucket does not already exist.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'unicred-media',
  'unicred-media',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Allow authenticated users to upload files
CREATE POLICY "Allow authenticated uploads to unicred-media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'unicred-media');

-- Storage RLS: Allow public read of all files
CREATE POLICY "Allow public read from unicred-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'unicred-media');


-- =======================================================
-- STORAGE RLS FIX: Allow anon + authenticated uploads
-- =======================================================
-- Run this if signup gives 'violates row-level security policy'.
-- The previous policy only allowed 'authenticated' role, but during signup
-- with email confirmation enabled, the session is null (anon role).
DROP POLICY IF EXISTS "Allow authenticated uploads to unicred-media" ON storage.objects;
CREATE POLICY "Allow anon and auth uploads to unicred-media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'unicred-media');


-- =======================================================
-- MIGRATION: Credit Economy Redesign (run on EXISTING DB)
-- =======================================================
-- Run ONLY this block if you already have the schema deployed
-- and just want to apply the credit economy changes safely.
-- DO NOT re-run the full schema above (it drops all tables).

-- Step 1: Add so_du column if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS so_du INTEGER DEFAULT 0;

-- Step 2: Re-create updated trigger functions (safe to run multiple times)
CREATE OR REPLACE FUNCTION check_job_post_credits()
RETURNS trigger AS $$
DECLARE
  v_credits INTEGER;
  v_so_du   INTEGER;
BEGIN
  SELECT credits, so_du INTO v_credits, v_so_du FROM users WHERE id = NEW.owner_id;

  IF v_credits < 20 THEN
    RAISE EXCEPTION 'Số dư credits của bạn không đủ để đăng việc (cần 20 credits cọc, hiện tại bạn có %).', v_credits;
  END IF;

  IF v_so_du < NEW.price THEN
    RAISE EXCEPTION 'Số dư không đủ để đăng việc (cần % đ, hiện tại bạn có % đ).', NEW.price, v_so_du;
  END IF;

  UPDATE users SET credits = credits - 20 WHERE id = NEW.owner_id;
  INSERT INTO credit_logs (user_id, amount, type) VALUES (NEW.owner_id, -20, 'job_post_stake');

  UPDATE users SET so_du = so_du - NEW.price WHERE id = NEW.owner_id;
  INSERT INTO credit_logs (user_id, amount, type) VALUES (NEW.owner_id, -NEW.price, 'job_post_budget');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION check_job_accept_credits()
RETURNS trigger AS $$
DECLARE
  v_credits INTEGER;
BEGIN
  IF NEW.assigned_worker_id IS NOT NULL AND (OLD.assigned_worker_id IS NULL OR OLD.assigned_worker_id != NEW.assigned_worker_id) THEN
    SELECT credits INTO v_credits FROM users WHERE id = NEW.assigned_worker_id;
    IF v_credits < 20 THEN
      RAISE EXCEPTION 'Số dư credits của ứng viên không đủ để nhận việc (cần 20 credits cọc).';
    END IF;
    UPDATE users SET credits = credits - 20 WHERE id = NEW.assigned_worker_id;
    INSERT INTO credit_logs (user_id, amount, type) VALUES (NEW.assigned_worker_id, -20, 'job_accept_stake');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION handle_job_status_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE users SET credits = credits + 30 WHERE id = NEW.owner_id;
    INSERT INTO credit_logs (user_id, amount, type) VALUES (NEW.owner_id, 30, 'job_completed_refund_bonus');
    UPDATE users SET trust_score = trust_score + 1 WHERE id = NEW.owner_id;
    IF NEW.assigned_worker_id IS NOT NULL THEN
      UPDATE users SET credits = credits + 30 WHERE id = NEW.assigned_worker_id;
      INSERT INTO credit_logs (user_id, amount, type) VALUES (NEW.assigned_worker_id, 30, 'job_completed_refund_bonus');
      UPDATE users SET trust_score = trust_score + 1 WHERE id = NEW.assigned_worker_id;
      UPDATE contracts SET status = 'completed' WHERE job_id = NEW.id;
    END IF;
  ELSIF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    UPDATE users SET trust_score = GREATEST(0, trust_score - 1) WHERE id = NEW.owner_id;
    IF NEW.assigned_worker_id IS NOT NULL THEN
      UPDATE users SET trust_score = GREATEST(0, trust_score - 1) WHERE id = NEW.assigned_worker_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

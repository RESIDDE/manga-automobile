-- Add foreign key constraint to audit_logs.user_id to enable joins with profiles
ALTER TABLE public.audit_logs 
  ADD CONSTRAINT fk_audit_logs_user_id 
  FOREIGN KEY (user_id) 
  REFERENCES public.profiles(id) 
  ON DELETE SET NULL;

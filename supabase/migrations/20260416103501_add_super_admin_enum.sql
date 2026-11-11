-- Run ALTER TYPE in a separate standalone transaction
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

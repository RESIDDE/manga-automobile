-- Update user_roles policy to allow super_admin
DROP POLICY IF EXISTS "Admins can view and edit all roles" ON public.user_roles;

CREATE POLICY "Admins and Super Admins can view and edit all roles" ON public.user_roles
FOR ALL TO authenticated 
USING (
  public.has_role('admin') OR public.has_role('super_admin')
)
WITH CHECK (
  public.has_role('admin') OR public.has_role('super_admin')
);

-- Update profiles policy to allow super_admin and admin to manage all profiles
-- (Select is already allowed for all authenticated users)
DROP POLICY IF EXISTS "Admins and Super Admins can manage all profiles" ON public.profiles;

CREATE POLICY "Admins and Super Admins can manage all profiles" ON public.profiles
FOR ALL TO authenticated
USING (
  public.has_role('admin') OR public.has_role('super_admin')
)
WITH CHECK (
  public.has_role('admin') OR public.has_role('super_admin')
);

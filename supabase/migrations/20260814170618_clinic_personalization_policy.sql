-- Applied to the SculptOS Clinic Supabase project on 2026-08-14.
-- Allows clinic administrators to personalize their own clinic name and profile.

create policy "admins can update their clinics" on public.clinics for update to authenticated
using (public.has_clinic_permission(id, 'users.manage'))
with check (public.has_clinic_permission(id, 'users.manage'));

create policy "users can insert their own profile" on public.profiles for insert to authenticated
with check (id = (select auth.uid()));

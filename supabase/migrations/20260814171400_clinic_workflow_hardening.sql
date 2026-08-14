-- Applied to the SculptOS Clinic Supabase project on 2026-08-14.
-- Hardens RPC privileges and adds indexes for the new scheduling workflow.

alter function public.validate_patient_tenant() set search_path = '';
revoke all on function public.validate_patient_tenant() from public, anon;
grant execute on function public.validate_patient_tenant() to authenticated;

revoke all on function public.bootstrap_my_clinic(text, text) from public, anon;
grant execute on function public.bootstrap_my_clinic(text, text) to authenticated;

revoke all on function public.is_clinic_member(uuid) from public, anon;
revoke all on function public.has_clinic_role(uuid, public.app_role) from public, anon;
revoke all on function public.has_clinic_permission(uuid, text) from public, anon;
grant execute on function public.is_clinic_member(uuid) to authenticated;
grant execute on function public.has_clinic_role(uuid, public.app_role) to authenticated;
grant execute on function public.has_clinic_permission(uuid, text) to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

create index if not exists appointments_patient_id_idx on public.appointments(patient_id);
create index if not exists appointments_organization_id_idx on public.appointments(organization_id);
create index if not exists appointments_created_by_idx on public.appointments(created_by);
create index if not exists patients_created_by_idx on public.patients(created_by);

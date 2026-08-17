-- Hotfix for the initial master pricing migration: functions are trigger-only,
-- so they must not be callable through the public RPC API.
alter function public.validate_treatment_tenant() set search_path = public;
revoke all on function public.seed_default_treatment_catalogue(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.initialize_clinic_treatment_catalogue() from public, anon, authenticated;

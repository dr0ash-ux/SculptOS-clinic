-- Applied to the SculptOS Clinic Supabase project on 2026-08-14.
-- Creates the first usable patient + appointment workflow and safe self-service workspace bootstrap.

alter table public.patients
  add column if not exists location text,
  add column if not exists occupation text,
  add column if not exists referral_source text,
  add column if not exists chief_complaint text,
  add column if not exists history_present_illness text,
  add column if not exists medical_history text,
  add column if not exists clinical_findings text,
  add column if not exists primary_diagnosis text,
  add column if not exists final_diagnosis text,
  add column if not exists treatment_advised text,
  add column if not exists timeline_notes text;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  clinician_name text not null,
  clinician_color text not null default 'teal' check (clinician_color in ('teal','violet','amber')),
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 30 check (duration_minutes between 15 and 480),
  treatment_label text not null default 'Check-up',
  status text not null default 'confirmed' check (status in ('confirmed','checked_in','completed','cancelled')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_clinic_scheduled_at_idx on public.appointments (clinic_id, scheduled_at);
alter table public.appointments enable row level security;

create policy "members can view appointments" on public.appointments for select to authenticated
using (public.has_clinic_permission(clinic_id, 'appointments.manage'));
create policy "authorized users can create appointments" on public.appointments for insert to authenticated
with check (public.has_clinic_permission(clinic_id, 'appointments.manage') and organization_id = (select organization_id from public.clinics where id = appointments.clinic_id));
create policy "authorized users can update appointments" on public.appointments for update to authenticated
using (public.has_clinic_permission(clinic_id, 'appointments.manage'))
with check (public.has_clinic_permission(clinic_id, 'appointments.manage'));
create policy "authorized users can delete appointments" on public.appointments for delete to authenticated
using (public.has_clinic_permission(clinic_id, 'appointments.manage'));

drop policy if exists "members can view their organizations" on public.organizations;
create policy "members can view their organizations" on public.organizations for select to authenticated
using (exists (select 1 from public.memberships m where m.organization_id = organizations.id and m.user_id = (select auth.uid()) and m.active));

create or replace function public.bootstrap_my_clinic(p_clinic_name text default 'My SculptOS Clinic', p_full_name text default null)
returns table (organization_id uuid, clinic_id uuid, clinic_name text, role public.app_role)
language plpgsql security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_membership record;
  created_org_id uuid;
  created_clinic_id uuid;
  safe_clinic_name text := left(coalesce(nullif(trim(p_clinic_name), ''), 'My SculptOS Clinic'), 120);
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;
  select m.organization_id, m.clinic_id, c.name, m.role into existing_membership
  from public.memberships m join public.clinics c on c.id = m.clinic_id
  where m.user_id = current_user_id and m.active order by m.created_at limit 1;
  if found then
    return query select existing_membership.organization_id, existing_membership.clinic_id, existing_membership.name, existing_membership.role;
    return;
  end if;
  insert into public.organizations (name, slug)
  values (safe_clinic_name, lower(regexp_replace(safe_clinic_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(replace(current_user_id::text, '-', ''), 1, 8))
  returning id into created_org_id;
  insert into public.clinics (organization_id, name) values (created_org_id, safe_clinic_name) returning id into created_clinic_id;
  insert into public.memberships (organization_id, clinic_id, user_id, role, active) values (created_org_id, created_clinic_id, current_user_id, 'admin', true);
  insert into public.profiles (id, full_name) values (current_user_id, nullif(trim(p_full_name), ''))
  on conflict (id) do update set full_name = coalesce(excluded.full_name, public.profiles.full_name), updated_at = now();
  return query select created_org_id, created_clinic_id, safe_clinic_name, 'admin'::public.app_role;
end;
$$;
revoke all on function public.bootstrap_my_clinic(text, text) from public;
grant execute on function public.bootstrap_my_clinic(text, text) to authenticated;

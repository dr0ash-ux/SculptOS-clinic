-- Branch clinician roster. These records are schedule resources, not authentication accounts.
create table public.clinic_practitioners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  practitioner_role text not null default 'Doctor' check (practitioner_role in ('Doctor','Specialist','Visiting consultant','Hygienist','Assistant')),
  registration_number text,
  schedule_color text not null default 'teal' check (schedule_color in ('teal','violet','amber')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, full_name)
);

create index clinic_practitioners_clinic_active_idx
  on public.clinic_practitioners (clinic_id, active, full_name);

alter table public.clinic_practitioners enable row level security;
grant select, insert, update, delete on public.clinic_practitioners to authenticated;

create policy "Clinic members can view practitioners"
on public.clinic_practitioners for select to authenticated
using (public.is_clinic_member(clinic_id));

create policy "Clinic admins manage practitioners"
on public.clinic_practitioners for all to authenticated
using (public.has_clinic_permission(clinic_id, 'users.manage'))
with check (public.has_clinic_permission(clinic_id, 'users.manage'));

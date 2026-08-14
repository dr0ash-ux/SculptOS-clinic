-- SculptOS Clinic: identity, multi-clinic tenancy, RBAC and RLS foundation.
-- Apply through Supabase migrations/CLI. Do not run against production manually without review.

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'doctor', 'receptionist', 'assistant', 'accountant');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clinics_organization_id_idx on public.clinics(organization_id);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'doctor',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);

create index memberships_user_clinic_idx on public.memberships(user_id, clinic_id);
create index memberships_org_idx on public.memberships(organization_id);

create table public.role_permissions (
  role public.app_role not null,
  permission text not null,
  primary key (role, permission)
);

insert into public.role_permissions(role, permission) values
('admin','patients.view'), ('admin','patients.create'), ('admin','patients.update'), ('admin','patients.delete'),
('admin','clinical.write'), ('admin','treatment_plans.write'), ('admin','appointments.manage'),
('admin','billing.view'), ('admin','billing.manage'), ('admin','inventory.manage'), ('admin','pharmacy.manage'),
('admin','crm.manage'), ('admin','ai.use'), ('admin','imaging.view'), ('admin','imaging.manage'), ('admin','users.manage'),
('admin','permissions.manage'), ('admin','audit.view'),
('doctor','patients.view'), ('doctor','patients.create'), ('doctor','patients.update'), ('doctor','clinical.write'),
('doctor','treatment_plans.write'), ('doctor','appointments.manage'), ('doctor','billing.view'), ('doctor','ai.use'),
('doctor','imaging.view'), ('doctor','imaging.manage'), ('doctor','pharmacy.use'),
('receptionist','patients.view'), ('receptionist','patients.create'), ('receptionist','patients.update'),
('receptionist','appointments.manage'), ('receptionist','billing.view'), ('receptionist','crm.manage'),
('receptionist','pharmacy.use'),
('assistant','patients.view'), ('assistant','appointments.manage'), ('assistant','imaging.view'), ('assistant','inventory.manage'),
('accountant','patients.view'), ('accountant','billing.view'), ('accountant','billing.manage'), ('accountant','inventory.manage');

create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  clinic_id uuid references public.clinics(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_clinic_created_idx on public.audit_log(clinic_id, created_at desc);
create index audit_log_actor_created_idx on public.audit_log(actor_user_id, created_at desc);

-- Example patient anchor. Future domain tables should follow this ownership pattern.
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_number text not null,
  first_name text not null,
  last_name text,
  date_of_birth date,
  sex text,
  phone text,
  email text,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, patient_number)
);

create index patients_clinic_idx on public.patients(clinic_id);
create index patients_org_idx on public.patients(organization_id);

-- Helper functions are SECURITY DEFINER only where needed to avoid policy recursion.
create or replace function public.is_clinic_member(target_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.clinic_id = target_clinic
      and m.user_id = auth.uid()
      and m.active = true
  );
$$;

create or replace function public.has_clinic_role(target_clinic uuid, required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.clinic_id = target_clinic
      and m.user_id = auth.uid()
      and m.active = true
      and m.role = required_role
  );
$$;

create or replace function public.has_clinic_permission(target_clinic uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.clinic_id = target_clinic
      and m.user_id = auth.uid()
      and m.active = true
      and rp.permission = required_permission
  );
$$;

revoke all on function public.is_clinic_member(uuid) from public;
revoke all on function public.has_clinic_role(uuid, public.app_role) from public;
revoke all on function public.has_clinic_permission(uuid, text) from public;
grant execute on function public.is_clinic_member(uuid) to authenticated;
grant execute on function public.has_clinic_role(uuid, public.app_role) to authenticated;
grant execute on function public.has_clinic_permission(uuid, text) to authenticated;

-- RLS: exposed application tables must be protected.
alter table public.organizations enable row level security;
alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_log enable row level security;
alter table public.patients enable row level security;

create policy "members can view their organizations"
on public.organizations for select to authenticated
using (exists (select 1 from public.memberships m where m.organization_id = id and m.user_id = auth.uid() and m.active));

create policy "members can view their clinics"
on public.clinics for select to authenticated
using (public.is_clinic_member(id));

create policy "users can view their own profile"
on public.profiles for select to authenticated
using (id = auth.uid());

create policy "users can update their own profile"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "members can view memberships in their clinic"
on public.memberships for select to authenticated
using (public.is_clinic_member(clinic_id));

create policy "admins can manage clinic memberships"
on public.memberships for all to authenticated
using (public.has_clinic_permission(clinic_id, 'users.manage'))
with check (public.has_clinic_permission(clinic_id, 'users.manage'));

create policy "authenticated users can view permissions"
on public.role_permissions for select to authenticated
using (exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.active));

create policy "members can view audit logs"
on public.audit_log for select to authenticated
using (clinic_id is not null and public.is_clinic_member(clinic_id));

create policy "admins can write audit logs"
on public.audit_log for insert to authenticated
with check (clinic_id is not null and public.has_clinic_permission(clinic_id, 'audit.view'));

create policy "members can view patients"
on public.patients for select to authenticated
using (public.has_clinic_permission(clinic_id, 'patients.view'));

create policy "authorized users can create patients"
on public.patients for insert to authenticated
with check (
  public.has_clinic_permission(clinic_id, 'patients.create')
  and organization_id = (select c.organization_id from public.clinics c where c.id = clinic_id)
);

create policy "authorized users can update patients"
on public.patients for update to authenticated
using (public.has_clinic_permission(clinic_id, 'patients.update'))
with check (public.has_clinic_permission(clinic_id, 'patients.update'));

create policy "admins can delete patients"
on public.patients for delete to authenticated
using (public.has_clinic_permission(clinic_id, 'patients.delete'));

-- New users get a profile automatically. Clinic membership is intentionally NOT automatic;
-- an admin/invitation flow must establish tenant access.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Keep organization_id aligned with the clinic. Prevent cross-tenant reassignment by clients.
create or replace function public.validate_patient_tenant()
returns trigger
language plpgsql
as $$
declare clinic_org uuid;
begin
  select organization_id into clinic_org from public.clinics where id = new.clinic_id;
  if clinic_org is null or clinic_org <> new.organization_id then
    raise exception 'Patient clinic and organization do not match';
  end if;
  return new;
end;
$$;

create trigger patients_validate_tenant
before insert or update on public.patients
for each row execute procedure public.validate_patient_tenant();

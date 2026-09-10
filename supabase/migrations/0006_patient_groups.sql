-- Lightweight patient classification for booking, clinical and billing workflows.
create table if not exists public.patient_groups (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, name)
);

create index if not exists patient_groups_clinic_sort_idx on public.patient_groups (clinic_id, sort_order, name);

alter table public.patients add column if not exists patient_group_id uuid references public.patient_groups(id) on delete set null;
alter table public.appointments add column if not exists patient_group_id uuid references public.patient_groups(id) on delete set null;
create index if not exists patients_patient_group_idx on public.patients (patient_group_id);
create index if not exists appointments_patient_group_idx on public.appointments (patient_group_id);

insert into public.patient_groups (clinic_id, name, sort_order)
select c.id, defaults.name, defaults.sort_order
from public.clinics c
cross join (values
  ('Self Pay', 10), ('CGHS', 20), ('EHS', 30), ('Ayushman Bharat', 40),
  ('Insurance', 50), ('Corporate', 60), ('Other', 70)
) as defaults(name, sort_order)
on conflict (clinic_id, name) do nothing;

update public.patients p
set patient_group_id = groups.id
from public.patient_groups groups
where groups.clinic_id = p.clinic_id
  and p.patient_group_id is null
  and groups.name = case
    when lower(coalesce(p.payer_group, '')) in ('', 'self-pay', 'self pay') then 'Self Pay'
    when lower(p.payer_group) in ('ayushman bharat pm-jay', 'ayushman bharat') then 'Ayushman Bharat'
    when lower(p.payer_group) in ('echs', 'ehs') then 'EHS'
    when lower(p.payer_group) in ('corporate insurance', 'tpa / private insurance') then 'Corporate'
    else p.payer_group
  end;

grant select, insert, update, delete on public.patient_groups to authenticated;
alter table public.patient_groups enable row level security;

create policy "members can view patient groups" on public.patient_groups for select to authenticated
using (public.has_clinic_permission(clinic_id, 'appointments.manage'));
create policy "admins can add patient groups" on public.patient_groups for insert to authenticated
with check (public.has_clinic_role(clinic_id, 'admin'));
create policy "admins can update patient groups" on public.patient_groups for update to authenticated
using (public.has_clinic_role(clinic_id, 'admin'))
with check (public.has_clinic_role(clinic_id, 'admin'));
create policy "admins can remove patient groups" on public.patient_groups for delete to authenticated
using (public.has_clinic_role(clinic_id, 'admin'));

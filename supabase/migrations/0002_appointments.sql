create type public.appointment_status as enum ('scheduled','confirmed','arrived','in_treatment','completed','cancelled','no_show');

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  doctor_id uuid not null references public.profiles(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  treatment text not null,
  notes text,
  status public.appointment_status not null default 'scheduled',
  reminder_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index appointments_clinic_time_idx on public.appointments(clinic_id, start_at);
create index appointments_patient_idx on public.appointments(patient_id);
alter table public.appointments enable row level security;

create policy "clinic members can view appointments" on public.appointments for select to authenticated
using (public.has_clinic_permission(clinic_id, 'appointments.manage'));
create policy "authorized users can manage appointments" on public.appointments for all to authenticated
using (public.has_clinic_permission(clinic_id, 'appointments.manage'))
with check (public.has_clinic_permission(clinic_id, 'appointments.manage') and organization_id = (select organization_id from public.clinics where id = clinic_id));

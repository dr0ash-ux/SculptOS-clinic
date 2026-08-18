create table if not exists public.staff_leave_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  practitioner_id uuid references public.clinic_practitioners(id) on delete set null,
  staff_name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text,
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists staff_leave_requests_clinic_dates_idx on public.staff_leave_requests (clinic_id, start_date, end_date);
alter table public.staff_leave_requests enable row level security;
grant select, insert, update, delete on public.staff_leave_requests to authenticated;
create policy "Clinic members can view leave requests" on public.staff_leave_requests for select to authenticated using (
  exists (select 1 from public.memberships m where m.clinic_id = staff_leave_requests.clinic_id and m.user_id = (select auth.uid()) and m.active)
);
create policy "Admins manage leave requests" on public.staff_leave_requests for all to authenticated using (
  exists (select 1 from public.memberships m where m.clinic_id = staff_leave_requests.clinic_id and m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
) with check (
  exists (select 1 from public.memberships m where m.clinic_id = staff_leave_requests.clinic_id and m.user_id = (select auth.uid()) and m.active and m.role = 'admin')
);

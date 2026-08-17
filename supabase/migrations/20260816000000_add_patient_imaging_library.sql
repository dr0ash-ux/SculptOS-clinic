-- Patient imaging library: private, clinic-scoped records and files.
create table if not exists public.patient_imaging (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  asset_type text not null check (asset_type in ('opg', 'cbct', 'intraoral_photo', 'extraoral_photo', 'document', 'scan')),
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  notes text,
  captured_at date not null default current_date,
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists patient_imaging_patient_created_idx
  on public.patient_imaging (patient_id, created_at desc);
create index if not exists patient_imaging_clinic_created_idx
  on public.patient_imaging (clinic_id, created_at desc);

alter table public.patient_imaging enable row level security;

create policy "clinic members can view patient imaging"
on public.patient_imaging for select to authenticated
using (public.has_clinic_permission(clinic_id, 'imaging.view'));

create policy "authorized users can create patient imaging"
on public.patient_imaging for insert to authenticated
with check (
  public.has_clinic_permission(clinic_id, 'imaging.manage')
  and organization_id = (select organization_id from public.clinics where id = patient_imaging.clinic_id)
  and exists (
    select 1 from public.patients p
    where p.id = patient_imaging.patient_id
      and p.clinic_id = patient_imaging.clinic_id
      and p.organization_id = patient_imaging.organization_id
  )
);

create policy "authorized users can update patient imaging"
on public.patient_imaging for update to authenticated
using (public.has_clinic_permission(clinic_id, 'imaging.manage'))
with check (public.has_clinic_permission(clinic_id, 'imaging.manage'));

create policy "authorized users can delete patient imaging"
on public.patient_imaging for delete to authenticated
using (public.has_clinic_permission(clinic_id, 'imaging.manage'));

insert into public.role_permissions(role, permission) values
  ('receptionist', 'imaging.view'),
  ('receptionist', 'imaging.manage'),
  ('assistant', 'imaging.manage')
on conflict do nothing;

insert into storage.buckets (id, name, public, file_size_limit)
values ('patient-imaging', 'patient-imaging', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy "clinic members can read patient imaging files"
on storage.objects for select to authenticated
using (
  bucket_id = 'patient-imaging'
  and exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.user_id = (select auth.uid())
      and m.active
      and m.clinic_id::text = (storage.foldername(name))[1]
      and rp.permission = 'imaging.view'
  )
);

create policy "authorized users can upload patient imaging files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'patient-imaging'
  and exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.user_id = (select auth.uid())
      and m.active
      and m.clinic_id::text = (storage.foldername(name))[1]
      and rp.permission = 'imaging.manage'
  )
);

create policy "authorized users can delete patient imaging files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'patient-imaging'
  and exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.user_id = (select auth.uid())
      and m.active
      and m.clinic_id::text = (storage.foldername(name))[1]
      and rp.permission = 'imaging.manage'
  )
);
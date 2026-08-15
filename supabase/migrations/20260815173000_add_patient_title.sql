alter table public.patients
  add column if not exists patient_title text;

alter table public.patients
  drop constraint if exists patients_patient_title_check;

alter table public.patients
  add constraint patients_patient_title_check
  check (patient_title is null or patient_title in ('Mr.', 'Ms.', 'Mrs.', 'Dr.'));
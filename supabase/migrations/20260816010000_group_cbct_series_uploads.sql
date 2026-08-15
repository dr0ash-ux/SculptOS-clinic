-- Store CBCT slice files as one patient-linked study.
alter table public.patient_imaging
  add column if not exists study_group_id uuid,
  add column if not exists sequence_no integer;

create index if not exists patient_imaging_study_group_idx
  on public.patient_imaging (study_group_id, sequence_no);

update storage.buckets
set file_size_limit = 52428800
where id = 'patient-imaging';
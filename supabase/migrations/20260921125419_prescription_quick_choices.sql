-- User-requested quick choices, not prescribing guidance.
insert into public.dental_medicine_references(code,name,strength,form,category,route,adult_reference,instructions,cautions,source_url,source_label,reviewed_on,default_dose,frequency) values
('clinic-amoxiclav-625','Amoxiclav','625 mg','Tablet','Clinic quick choice','Oral','','After meals','Review suitability for the individual patient.','','Clinic-entered quick choice',current_date,'1 tablet','BID'),
('clinic-zerodol-sp','Zerodol','SP','Tablet','Clinic quick choice','Oral','','After meals; SOS / as needed','Review suitability and exact pack formulation for the individual patient.','','Clinic-entered quick choice',current_date,'1 tablet','BID')
on conflict(code) do nothing;
create table public.clinic_prescription_choices (
 clinic_id uuid not null references public.clinics(id) on delete cascade,
 medicine_key text not null,
 item jsonb not null check(jsonb_typeof(item)='object'),
 primary key(clinic_id,medicine_key)
);
alter table public.clinic_prescription_choices enable row level security;
revoke all on public.clinic_prescription_choices from public,anon,authenticated;
grant select,insert,update,delete on public.clinic_prescription_choices to authenticated;
create policy "Prescribers read clinic choices" on public.clinic_prescription_choices for select to authenticated using(public.has_clinic_permission(clinic_id,'prescriptions.write'));
create policy "Prescribers save clinic choices" on public.clinic_prescription_choices for insert to authenticated with check(public.has_clinic_permission(clinic_id,'prescriptions.write'));
create policy "Prescribers edit clinic choices" on public.clinic_prescription_choices for update to authenticated using(public.has_clinic_permission(clinic_id,'prescriptions.write')) with check(public.has_clinic_permission(clinic_id,'prescriptions.write'));
create policy "Prescribers remove clinic choices" on public.clinic_prescription_choices for delete to authenticated using(public.has_clinic_permission(clinic_id,'prescriptions.write'));

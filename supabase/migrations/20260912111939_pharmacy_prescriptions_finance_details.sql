begin;
alter table public.membership_permission_overrides drop constraint membership_permission_overrides_permission_check;
alter table public.membership_permission_overrides add constraint membership_permission_overrides_permission_check check(permission in ('patients.view','patients.create','patients.update','patients.dates.edit','patients.delete','clinical.write','treatment_plans.write','treatment_plans.delete','imaging.view','imaging.manage','imaging.delete','pricing.view','pricing.manage','patient_price.override','treatment_discount.apply','finance.view','finance.manage','inventory.view','inventory.manage','appointments.manage','leave.request','pharmacy.view','pharmacy.manage','prescriptions.write'));
-- New capabilities start with administrators only. Staff require an explicit per-member grant.
insert into public.role_permissions(role,permission) values ('admin','pharmacy.view'),('admin','prescriptions.write') on conflict do nothing;

create table public.dental_medicine_references (
 code text primary key, name text not null, strength text not null, form text not null, category text not null,
 route text not null, adult_reference text not null, instructions text not null, cautions text not null,
 source_url text not null, source_label text not null default 'SDCEP · Drug Prescribing for Dentistry', reviewed_on date not null
);
alter table public.dental_medicine_references enable row level security;
revoke all on public.dental_medicine_references from anon,authenticated;
grant select on public.dental_medicine_references to authenticated;
create policy "Members read medicine references" on public.dental_medicine_references for select to authenticated using(exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.active and public.has_clinic_permission(m.clinic_id,'pharmacy.view')));
-- Real reference information, not stock or patient seed data. Adults only; clinician determines each prescription.
insert into public.dental_medicine_references(code,name,strength,form,category,route,adult_reference,instructions,cautions,source_url,reviewed_on) values
('paracetamol-500','Paracetamol','500 mg','Tablet','Analgesic','Oral','Adult dental reference: 1,000 mg per dose, up to four doses daily. At least 4 hours between doses; maximum 4,000 mg in 24 hours.','Avoid taking any other medicine containing paracetamol at the same time.','Check liver disease, low body weight and alcohol use; a lower daily limit may be required. Adult reference only.','https://www.sdcepdentalprescribing.nhs.scot/guidance/odontogenic-pain/analgesics/paracetamol/','2026-09-12'),
('ibuprofen-400','Ibuprofen','400 mg','Tablet','Analgesic','Oral','Adult dental reference: 400 mg per dose, four times daily for a short course, up to 5 days.','Take after food. Do not combine with another NSAID.','Check NSAID allergy/asthma, ulcers, anticoagulants, renal disease and pregnancy. Avoid with daily low-dose aspirin.','https://www.sdcepdentalprescribing.nhs.scot/guidance/odontogenic-pain/analgesics/ibuprofen/','2026-09-12'),
('diclofenac-50','Diclofenac sodium','50 mg','Enteric-coated tablet','Analgesic','Oral','Adult dental reference: 50 mg per dose, three times daily; maximum 150 mg per day. Short course up to 5 days.','Swallow the tablet intact; do not crush or chew. Do not combine with another NSAID.','Avoid in pregnancy, cardiovascular disease, heart failure or NSAID hypersensitivity. Review ulcer, renal and anticoagulant risks.','https://www.sdcepdentalprescribing.nhs.scot/guidance/odontogenic-pain/analgesics/diclofenac/','2026-09-12'),
('amoxicillin-500','Amoxicillin','500 mg','Capsule','Antibiotic','Oral','Adult dental abscess reference, only when indicated: 500 mg three times daily, usually 3–5 days; clinical review at about 3 days.','Space doses evenly. Follow the prescribed course and return for the planned review. Contact the clinic if symptoms worsen.','Check penicillin allergy. Local dental treatment is primary; antibiotics are not routine for uncomplicated dental pain. Adjust for renal impairment when indicated.','https://www.sdcepdentalprescribing.nhs.scot/guidance/bacterial-infections/dental-abscess/first-line-antibiotics/amoxicillin/','2026-09-12'),
('metronidazole-400','Metronidazole','400 mg','Tablet','Antibiotic','Oral','Adult dental abscess reference, only when indicated: 400 mg three times daily, usually 3–5 days; clinical review at about 3 days.','Space doses evenly. Avoid alcohol during treatment and for 48 hours after the final dose. Return for review as directed.','Review warfarin and other interactions, liver disease and pregnancy. Use only with a documented indication.','https://www.sdcepdentalprescribing.nhs.scot/guidance/bacterial-infections/dental-abscess/first-line-antibiotics/metronidazole/','2026-09-12'),
('miconazole-20','Miconazole','20 mg/g (2%)','Oromucosal gel','Antifungal','Oromucosal','Adult localised oral candidosis reference: a pea-sized amount four times daily after meals, for 7 days.','Apply locally after meals, following the prescribed directions.','Avoid with warfarin or statins; topical absorption can cause significant interactions. Review the full medication list.','https://www.sdcepdentalprescribing.nhs.scot/guidance/fungal-infections/candidosis/miconazole/','2026-09-12'),
('nystatin-100000','Nystatin','100,000 units/mL','Oral suspension','Antifungal','Oral','Adult oral candidosis reference: 1 mL four times daily after meals, for 7 days.','Measure each dose accurately and use after meals as directed.','Confirm the suspension concentration and indication. Persistent or recurrent candidosis needs assessment of underlying causes.','https://www.sdcepdentalprescribing.nhs.scot/guidance/fungal-infections/candidosis/nystatin/','2026-09-12'),
('chlorhexidine-02','Chlorhexidine digluconate','0.2% w/v (2 mg/mL)','Mouthwash','Antiseptic','Mouth rinse','Adult reference: 10 mL, twice daily. Duration depends on the indication and clinician review.','Rinse for one minute and spit out; do not swallow. Wait 30 minutes before food or drink. Use separately from toothbrushing.','Check chlorhexidine allergy. Short-term use; may cause staining or altered taste. Confirm the product concentration.','https://www.medicines.org.uk/emc/product/4818/smpc','2026-09-12');
update public.dental_medicine_references set source_label='Manufacturer SmPC · emc / NHS administration guidance' where code='chlorhexidine-02';
create table public.clinic_medicines (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id),
 name text not null check(length(trim(name)) between 1 and 160), strength text not null check(length(trim(strength)) between 1 and 80),
 form text not null check(length(trim(form)) between 1 and 80), category text not null default 'Other',route text not null,
 adult_reference text not null default '',instructions text not null default '',cautions text not null default '',
 active boolean not null default true, created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index clinic_medicines_unique on public.clinic_medicines(clinic_id,lower(trim(name)),lower(trim(strength)),lower(trim(form)));
alter table public.clinic_medicines enable row level security;
revoke all on public.clinic_medicines from anon,authenticated;
grant select,insert,update on public.clinic_medicines to authenticated;
create policy "Medicine view" on public.clinic_medicines for select to authenticated using(public.has_clinic_permission(clinic_id,'pharmacy.view'));
create policy "Medicine add" on public.clinic_medicines for insert to authenticated with check(public.has_clinic_permission(clinic_id,'pharmacy.manage') and public.has_clinic_permission(clinic_id,'pharmacy.view'));
create policy "Medicine edit" on public.clinic_medicines for update to authenticated using(public.has_clinic_permission(clinic_id,'pharmacy.manage') and public.has_clinic_permission(clinic_id,'pharmacy.view')) with check(public.has_clinic_permission(clinic_id,'pharmacy.manage') and public.has_clinic_permission(clinic_id,'pharmacy.view'));
create function public.guard_clinic_medicine() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='UPDATE' then if new.clinic_id<>old.clinic_id or new.id<>old.id then raise exception 'Medicine branch cannot change';end if;new.created_by:=old.created_by;new.created_at:=old.created_at;
 else new.created_by:=auth.uid();new.created_at:=now();end if;new.updated_at:=now();return new;end $$;
create trigger guard_clinic_medicine before insert or update on public.clinic_medicines for each row execute function public.guard_clinic_medicine();
create table public.patient_prescriptions (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id),patient_id uuid not null references public.patients(id) on delete cascade,
 prescribed_on date not null default current_date,prescriber_name text not null check(length(trim(prescriber_name)) between 1 and 160),
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 30),
 patient_name text not null default '',patient_number text not null default '',clinic_name text not null default '',
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index patient_prescriptions_patient on public.patient_prescriptions(clinic_id,patient_id,created_at desc);
alter table public.patient_prescriptions enable row level security;
revoke all on public.patient_prescriptions from anon,authenticated;
grant select,insert on public.patient_prescriptions to authenticated;
create policy "Prescription view" on public.patient_prescriptions for select to authenticated using(public.has_clinic_permission(clinic_id,'patients.view'));
create policy "Prescription create" on public.patient_prescriptions for insert to authenticated with check(public.has_clinic_permission(clinic_id,'patients.view') and public.has_clinic_permission(clinic_id,'pharmacy.view') and public.has_clinic_permission(clinic_id,'prescriptions.write'));
-- Immutable prescription snapshots. Subsequent edits create a new saved version.
create function public.guard_patient_prescription() returns trigger language plpgsql set search_path='' as $$
declare item jsonb; field text; p public.patients; med_name text;med_strength text;med_form text;
begin
 select * into p from public.patients where id=new.patient_id and clinic_id=new.clinic_id;
 if p.id is null then raise exception 'Choose a patient in this branch';end if;
 if new.prescribed_on>current_date+1 or new.prescribed_on<date '2000-01-01' then raise exception 'Invalid prescription date';end if;
 for item in select value from jsonb_array_elements(new.items) loop
  foreach field in array array['medicine_key','name','strength','form','route','dose','frequency','duration','instructions'] loop
   if jsonb_typeof(item->field) is distinct from 'string' or length(trim(item->>field))<1 or length(item->>field)>1000 then raise exception 'Complete each medicine dose, route, frequency, duration and instructions';end if;
  end loop;
  med_name:=null;
  if item->>'medicine_key' like 'ref:%' then select name,strength,form into med_name,med_strength,med_form from public.dental_medicine_references where code=substring(item->>'medicine_key' from 5);
  else select name,strength,form into med_name,med_strength,med_form from public.clinic_medicines where id::text=substring(item->>'medicine_key' from 8) and clinic_id=new.clinic_id and active;end if;
  if med_name is null or item->>'name'<>med_name or item->>'strength'<>med_strength or item->>'form'<>med_form then raise exception 'Medicine changed or is unavailable. Select it again from the catalogue.';end if;
 end loop;
 new.patient_name:=concat_ws(' ',p.patient_title,p.first_name,p.last_name);new.patient_number:=p.patient_number;
 select name into new.clinic_name from public.clinics where id=new.clinic_id;
 new.created_by:=auth.uid();new.created_at:=now();return new;
end $$;
create trigger guard_patient_prescription before insert on public.patient_prescriptions for each row execute function public.guard_patient_prescription();

alter table public.financial_transactions add column counterparty text check(length(counterparty)<=160),add column reference_number text check(length(reference_number)<=120),add column expense_period date;
create function public.guard_finance_details() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='UPDATE' and new.clinic_id<>old.clinic_id then raise exception 'Financial entry branch cannot change';end if;
 if new.patient_id is not null and not exists(select 1 from public.patients where id=new.patient_id and clinic_id=new.clinic_id) then raise exception 'Patient must belong to this branch';end if;
 return new;end $$;
create trigger guard_finance_details before insert or update on public.financial_transactions for each row execute function public.guard_finance_details();
revoke all on function public.guard_clinic_medicine(),public.guard_patient_prescription(),public.guard_finance_details() from public,anon,authenticated;
commit;

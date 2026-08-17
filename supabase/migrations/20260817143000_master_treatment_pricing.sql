-- Master treatment catalogue, snapshot pricing and patient treatment plans.
-- Prices intentionally default to 0: each clinic configures its own charges.

create table public.treatment_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (clinic_id, name)
);

create table public.treatment_catalogue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  category_id uuid not null references public.treatment_categories(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 180),
  internal_code text, description text,
  standard_price numeric(12,2) not null default 0 check (standard_price >= 0),
  pricing_unit text not null default 'Per treatment' check (pricing_unit in ('Per treatment','Per tooth','Per surface','Per quadrant','Per arch','Per unit','Per implant','Per session','Per visit','Per stage','Full case','Per image','Per site','Per appliance','Custom')),
  tax_applicable boolean not null default false, active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (clinic_id, name, pricing_unit)
);

create table public.treatment_price_history (
  id bigint generated always as identity primary key,
  treatment_catalogue_id uuid not null references public.treatment_catalogue(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  previous_price numeric(12,2), new_price numeric(12,2) not null,
  changed_by uuid references auth.users(id) on delete set null, changed_at timestamptz not null default now()
);

create table public.patient_treatment_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  status text not null default 'active' check (status in ('active','superseded','cancelled')),
  additional_adjustment numeric(12,2) not null default 0,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index patient_active_treatment_plan_idx on public.patient_treatment_plans(patient_id) where status = 'active';

create table public.patient_treatment_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  treatment_plan_id uuid not null references public.patient_treatment_plans(id) on delete cascade,
  treatment_catalogue_id uuid references public.treatment_catalogue(id) on delete set null,
  treatment_name_snapshot text not null, tooth_or_region text,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price_snapshot numeric(12,2) not null check (unit_price_snapshot >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  final_price numeric(12,2) not null check (final_price >= 0),
  custom_price boolean not null default false, price_adjustment_reason text,
  status text not null default 'Planned' check (status in ('Planned','Accepted','In Progress','Completed','Deferred','Cancelled')),
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index treatment_catalogue_clinic_active_idx on public.treatment_catalogue(clinic_id, active, name);
create index patient_treatment_items_plan_idx on public.patient_treatment_items(treatment_plan_id, created_at);

create or replace function public.validate_treatment_tenant() returns trigger language plpgsql set search_path = public as $$
declare clinic_org uuid; patient_clinic uuid;
begin
  select organization_id into clinic_org from public.clinics where id = new.clinic_id;
  if clinic_org is null or clinic_org <> new.organization_id then raise exception 'Treatment clinic and organization do not match'; end if;
  if tg_table_name in ('patient_treatment_plans','patient_treatment_items') then
    select clinic_id into patient_clinic from public.patients where id = new.patient_id;
    if patient_clinic is null or patient_clinic <> new.clinic_id then raise exception 'Treatment patient and clinic do not match'; end if;
  end if;
  return new;
end; $$;
create trigger treatment_categories_validate_tenant before insert or update on public.treatment_categories for each row execute procedure public.validate_treatment_tenant();
create trigger treatment_catalogue_validate_tenant before insert or update on public.treatment_catalogue for each row execute procedure public.validate_treatment_tenant();
create trigger patient_treatment_plans_validate_tenant before insert or update on public.patient_treatment_plans for each row execute procedure public.validate_treatment_tenant();
create trigger patient_treatment_items_validate_tenant before insert or update on public.patient_treatment_items for each row execute procedure public.validate_treatment_tenant();

create or replace function public.track_treatment_price_change() returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at := now(); new.updated_by := auth.uid();
  if new.standard_price is distinct from old.standard_price then
    insert into public.treatment_price_history(treatment_catalogue_id,organization_id,clinic_id,previous_price,new_price,changed_by) values (new.id,new.organization_id,new.clinic_id,old.standard_price,new.standard_price,auth.uid());
  end if;
  return new;
end; $$;
create trigger treatment_catalogue_price_audit before update on public.treatment_catalogue for each row execute procedure public.track_treatment_price_change();

alter table public.treatment_categories enable row level security;
alter table public.treatment_catalogue enable row level security;
alter table public.treatment_price_history enable row level security;
alter table public.patient_treatment_plans enable row level security;
alter table public.patient_treatment_items enable row level security;
grant select, insert, update, delete on public.treatment_categories, public.treatment_catalogue, public.patient_treatment_plans, public.patient_treatment_items to authenticated;
grant select on public.treatment_price_history to authenticated;

insert into public.role_permissions(role,permission) values
('admin','pricing.view'),('admin','pricing.manage'),('admin','treatment_discount.apply'),('admin','patient_price.override'),('doctor','pricing.view'),('doctor','treatment_discount.apply'),('doctor','patient_estimate.view'),('receptionist','pricing.view'),('receptionist','patient_estimate.view'),('accountant','pricing.view'),('accountant','patient_estimate.view') on conflict do nothing;

create policy "members view treatment categories" on public.treatment_categories for select to authenticated using (public.has_clinic_permission(clinic_id,'pricing.view'));
create policy "admins manage treatment categories" on public.treatment_categories for all to authenticated using (public.has_clinic_permission(clinic_id,'pricing.manage')) with check (public.has_clinic_permission(clinic_id,'pricing.manage'));
create policy "members view treatment catalogue" on public.treatment_catalogue for select to authenticated using (public.has_clinic_permission(clinic_id,'pricing.view'));
create policy "admins manage treatment catalogue" on public.treatment_catalogue for all to authenticated using (public.has_clinic_permission(clinic_id,'pricing.manage')) with check (public.has_clinic_permission(clinic_id,'pricing.manage'));
create policy "admins view price history" on public.treatment_price_history for select to authenticated using (public.has_clinic_permission(clinic_id,'pricing.manage'));
create policy "staff view treatment plans" on public.patient_treatment_plans for select to authenticated using (public.has_clinic_permission(clinic_id,'patients.view'));
create policy "clinical staff manage treatment plans" on public.patient_treatment_plans for all to authenticated using (public.has_clinic_permission(clinic_id,'treatment_plans.write')) with check (public.has_clinic_permission(clinic_id,'treatment_plans.write'));
create policy "staff view treatment items" on public.patient_treatment_items for select to authenticated using (public.has_clinic_permission(clinic_id,'patients.view'));
create policy "clinical staff manage treatment items" on public.patient_treatment_items for all to authenticated using (public.has_clinic_permission(clinic_id,'treatment_plans.write')) with check (public.has_clinic_permission(clinic_id,'treatment_plans.write'));

create or replace function public.seed_default_treatment_catalogue(p_organization_id uuid, p_clinic_id uuid, p_actor uuid default null) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.treatment_categories(organization_id,clinic_id,name,sort_order) values
  (p_organization_id,p_clinic_id,'Consultation & Diagnostics',10),(p_organization_id,p_clinic_id,'Radiology / Imaging',20),(p_organization_id,p_clinic_id,'Preventive Dentistry',30),(p_organization_id,p_clinic_id,'Restorative Dentistry',40),(p_organization_id,p_clinic_id,'Endodontics',50),(p_organization_id,p_clinic_id,'Periodontics',60),(p_organization_id,p_clinic_id,'Oral & Maxillofacial Surgery',70),(p_organization_id,p_clinic_id,'Implantology',80),(p_organization_id,p_clinic_id,'Prosthodontics',90),(p_organization_id,p_clinic_id,'Orthodontics',100),(p_organization_id,p_clinic_id,'Pediatric Dentistry',110),(p_organization_id,p_clinic_id,'Aesthetic / Cosmetic Dentistry',120),(p_organization_id,p_clinic_id,'Occlusion / TMJ',130),(p_organization_id,p_clinic_id,'Emergency Dentistry',140),(p_organization_id,p_clinic_id,'Other / Custom Treatment',999) on conflict do nothing;
  insert into public.treatment_catalogue(organization_id,clinic_id,category_id,name,pricing_unit,created_by)
  select p_organization_id,p_clinic_id,c.id,v.name,v.unit,p_actor from (values
    ('Consultation & Diagnostics','New patient consultation','Per visit'),('Consultation & Diagnostics','Routine consultation','Per visit'),('Consultation & Diagnostics','Specialist consultation','Per visit'),('Consultation & Diagnostics','Emergency consultation','Per visit'),('Consultation & Diagnostics','Follow-up consultation','Per visit'),('Consultation & Diagnostics','Comprehensive oral examination','Per visit'),('Consultation & Diagnostics','Periodontal examination','Per visit'),('Consultation & Diagnostics','Orthodontic consultation','Per visit'),('Consultation & Diagnostics','Implant consultation','Per visit'),('Consultation & Diagnostics','Oral surgery consultation','Per visit'),
    ('Radiology / Imaging','Intraoral periapical radiograph / IOPA','Per image'),('Radiology / Imaging','Bitewing radiograph','Per image'),('Radiology / Imaging','Occlusal radiograph','Per image'),('Radiology / Imaging','OPG / panoramic radiograph','Per treatment'),('Radiology / Imaging','Lateral cephalogram','Per treatment'),('Radiology / Imaging','PA cephalogram','Per treatment'),('Radiology / Imaging','TMJ radiographic study','Per treatment'),('Radiology / Imaging','CBCT — small FOV','Per treatment'),('Radiology / Imaging','CBCT — medium FOV','Per treatment'),('Radiology / Imaging','CBCT — full arch / large FOV','Per treatment'),('Radiology / Imaging','Other diagnostic imaging','Custom'),
    ('Preventive Dentistry','Scaling','Per treatment'),('Preventive Dentistry','Scaling and polishing','Per treatment'),('Preventive Dentistry','Prophylaxis','Per treatment'),('Preventive Dentistry','Fluoride application','Per treatment'),('Preventive Dentistry','Pit and fissure sealant','Per tooth'),('Preventive Dentistry','Desensitisation treatment','Per tooth'),('Preventive Dentistry','Oral hygiene instruction / preventive care','Per visit'),
    ('Restorative Dentistry','Temporary restoration','Per tooth'),('Restorative Dentistry','GIC restoration — 1 surface','Per surface'),('Restorative Dentistry','GIC restoration — 2 surfaces','Per surface'),('Restorative Dentistry','GIC restoration — 3+ surfaces','Per surface'),('Restorative Dentistry','Composite restoration — 1 surface','Per surface'),('Restorative Dentistry','Composite restoration — 2 surfaces','Per surface'),('Restorative Dentistry','Composite restoration — 3+ surfaces','Per surface'),('Restorative Dentistry','Anterior composite restoration','Per tooth'),('Restorative Dentistry','Posterior composite restoration','Per tooth'),('Restorative Dentistry','Direct composite build-up','Per tooth'),('Restorative Dentistry','Inlay','Per unit'),('Restorative Dentistry','Onlay','Per unit'),('Restorative Dentistry','Core build-up','Per tooth'),('Restorative Dentistry','Post and core','Per tooth'),('Restorative Dentistry','Tooth-coloured aesthetic restoration','Per tooth'),('Restorative Dentistry','Repair of restoration','Per tooth'),
    ('Endodontics','Emergency access opening','Per tooth'),('Endodontics','Pulpotomy','Per tooth'),('Endodontics','Pulpectomy','Per tooth'),('Endodontics','Root canal treatment — anterior','Per tooth'),('Endodontics','Root canal treatment — premolar','Per tooth'),('Endodontics','Root canal treatment — molar','Per tooth'),('Endodontics','Re-root canal treatment — anterior','Per tooth'),('Endodontics','Re-root canal treatment — premolar','Per tooth'),('Endodontics','Re-root canal treatment — molar','Per tooth'),('Endodontics','Apexification','Per tooth'),('Endodontics','Apexogenesis','Per tooth'),('Endodontics','Regenerative endodontic procedure','Per tooth'),('Endodontics','Apicoectomy / periapical surgery','Per tooth'),('Endodontics','Post removal','Per tooth'),('Endodontics','Separated instrument management / removal','Per tooth'),
    ('Periodontics','Root planing','Per quadrant'),('Periodontics','Deep cleaning / periodontal therapy','Per quadrant'),('Periodontics','Gingivectomy','Per quadrant'),('Periodontics','Gingivoplasty','Per quadrant'),('Periodontics','Periodontal flap surgery','Per quadrant'),('Periodontics','Crown lengthening','Per tooth'),('Periodontics','Frenectomy','Per treatment'),('Periodontics','Free gingival graft','Per site'),('Periodontics','Connective tissue graft','Per site'),('Periodontics','Bone grafting','Per site'),('Periodontics','Guided tissue regeneration','Per site'),('Periodontics','Periodontal maintenance','Per visit'),('Periodontics','Splinting of mobile teeth','Per treatment'),
    ('Oral & Maxillofacial Surgery','Simple extraction','Per tooth'),('Oral & Maxillofacial Surgery','Surgical extraction','Per tooth'),('Oral & Maxillofacial Surgery','Root stump removal','Per tooth'),('Oral & Maxillofacial Surgery','Impacted tooth removal','Per tooth'),('Oral & Maxillofacial Surgery','Impacted third molar surgery','Per tooth'),('Oral & Maxillofacial Surgery','Alveoloplasty','Per quadrant'),('Oral & Maxillofacial Surgery','Incision and drainage','Per treatment'),('Oral & Maxillofacial Surgery','Biopsy','Per treatment'),('Oral & Maxillofacial Surgery','Cyst enucleation','Custom'),('Oral & Maxillofacial Surgery','Cyst marsupialisation / decompression','Custom'),('Oral & Maxillofacial Surgery','Pre-prosthetic surgery','Custom'),('Oral & Maxillofacial Surgery','Management of oroantral communication / fistula','Custom'),('Oral & Maxillofacial Surgery','TMJ procedures','Custom'),('Oral & Maxillofacial Surgery','Facial trauma procedures','Custom'),('Oral & Maxillofacial Surgery','Dentoalveolar fracture management','Custom'),('Oral & Maxillofacial Surgery','Mandibular fracture management','Custom'),('Oral & Maxillofacial Surgery','Midface fracture management','Custom'),('Oral & Maxillofacial Surgery','Zygomatic complex fracture management','Custom'),('Oral & Maxillofacial Surgery','Orthognathic surgery','Full case'),('Oral & Maxillofacial Surgery','Genioplasty','Full case'),('Oral & Maxillofacial Surgery','Distraction osteogenesis','Full case'),
    ('Implantology','Single implant placement','Per implant'),('Implantology','Multiple implant placement','Per implant'),('Implantology','Immediate implant placement','Per implant'),('Implantology','Implant uncovering','Per implant'),('Implantology','Healing abutment placement','Per implant'),('Implantology','Implant-supported crown','Per unit'),('Implantology','Implant-supported bridge','Per unit'),('Implantology','Implant-supported overdenture','Full case'),('Implantology','Full-arch implant rehabilitation','Full case'),('Implantology','Socket preservation','Per site'),('Implantology','Ridge augmentation','Per site'),('Implantology','Guided bone regeneration','Per site'),('Implantology','Sinus lift — internal','Per site'),('Implantology','Sinus lift — lateral','Per site'),('Implantology','Implant removal','Per implant'),('Implantology','Peri-implant treatment','Per implant'),
    ('Prosthodontics','Metal crown','Per unit'),('Prosthodontics','PFM crown','Per unit'),('Prosthodontics','Zirconia crown','Per unit'),('Prosthodontics','Monolithic zirconia crown','Per unit'),('Prosthodontics','Ceramic crown','Per unit'),('Prosthodontics','E-max / lithium-disilicate crown','Per unit'),('Prosthodontics','Temporary crown','Per unit'),('Prosthodontics','Metal bridge','Per unit'),('Prosthodontics','PFM bridge','Per unit'),('Prosthodontics','Zirconia bridge','Per unit'),('Prosthodontics','Ceramic bridge','Per unit'),('Prosthodontics','Maryland / resin-bonded bridge','Per unit'),('Prosthodontics','Acrylic removable partial denture','Per arch'),('Prosthodontics','Cast partial denture','Per arch'),('Prosthodontics','Flexible partial denture','Per arch'),('Prosthodontics','Complete denture','Per arch'),('Prosthodontics','Immediate denture','Per arch'),('Prosthodontics','Overdenture','Per arch'),('Prosthodontics','Denture repair','Per treatment'),('Prosthodontics','Denture reline','Per arch'),('Prosthodontics','Denture rebase','Per arch'),('Prosthodontics','Addition of tooth to denture','Per tooth'),
    ('Orthodontics','Diagnostic records','Full case'),('Orthodontics','Fixed orthodontic treatment — metal','Full case'),('Orthodontics','Fixed orthodontic treatment — ceramic','Full case'),('Orthodontics','Self-ligating appliance treatment','Full case'),('Orthodontics','Clear aligner treatment','Full case'),('Orthodontics','Limited orthodontic treatment','Full case'),('Orthodontics','Removable orthodontic appliance','Per appliance'),('Orthodontics','Functional appliance','Per appliance'),('Orthodontics','Expansion appliance','Per appliance'),('Orthodontics','Space maintainer','Per appliance'),('Orthodontics','Habit-breaking appliance','Per appliance'),('Orthodontics','Retainer — removable','Per arch'),('Orthodontics','Retainer — fixed','Per arch'),('Orthodontics','Retainer replacement','Per arch'),('Orthodontics','Orthodontic adjustment','Per visit'),('Orthodontics','Miniscrew / TAD placement','Per unit'),
    ('Pediatric Dentistry','Pediatric consultation','Per visit'),('Pediatric Dentistry','Stainless steel crown','Per tooth'),('Pediatric Dentistry','Strip crown','Per tooth'),('Pediatric Dentistry','Pediatric extraction','Per tooth'),('Pediatric Dentistry','Trauma management','Per treatment'),('Pediatric Dentistry','Preventive resin treatment','Per tooth'),
    ('Aesthetic / Cosmetic Dentistry','Teeth whitening — office','Per treatment'),('Aesthetic / Cosmetic Dentistry','Teeth whitening — home','Per treatment'),('Aesthetic / Cosmetic Dentistry','Composite veneer','Per tooth'),('Aesthetic / Cosmetic Dentistry','Ceramic veneer','Per tooth'),('Aesthetic / Cosmetic Dentistry','Smile design consultation','Per visit'),('Aesthetic / Cosmetic Dentistry','Diastema closure','Per tooth'),('Aesthetic / Cosmetic Dentistry','Cosmetic composite bonding','Per tooth'),('Aesthetic / Cosmetic Dentistry','Tooth reshaping / recontouring','Per tooth'),
    ('Occlusion / TMJ','Occlusal analysis','Per visit'),('Occlusion / TMJ','Occlusal adjustment','Per treatment'),('Occlusion / TMJ','Night guard','Per arch'),('Occlusion / TMJ','Bruxism appliance','Per arch'),('Occlusion / TMJ','TMJ splint','Per arch'),('Occlusion / TMJ','TMJ consultation','Per visit'),
    ('Emergency Dentistry','Drainage of dental abscess','Per treatment'),('Emergency Dentistry','Recementation of crown','Per unit'),('Emergency Dentistry','Recementation of bridge','Per unit'),('Emergency Dentistry','Trauma stabilisation','Per treatment'),('Emergency Dentistry','Temporary splinting','Per treatment')
  ) as v(category_name,name,unit) join public.treatment_categories c on c.clinic_id=p_clinic_id and c.name=v.category_name on conflict do nothing;
end; $$;
revoke all on function public.seed_default_treatment_catalogue(uuid,uuid,uuid) from public;

-- Seed existing clinics. Future self-service clinics call this below.
select public.seed_default_treatment_catalogue(c.organization_id,c.id,null) from public.clinics c;

create or replace function public.initialize_clinic_treatment_catalogue() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_treatment_catalogue(new.organization_id,new.id,auth.uid());
  return new;
end; $$;
create trigger clinics_initialize_treatment_catalogue
after insert on public.clinics for each row execute procedure public.initialize_clinic_treatment_catalogue();
revoke all on function public.initialize_clinic_treatment_catalogue() from public;
revoke all on function public.seed_default_treatment_catalogue(uuid,uuid,uuid) from anon, authenticated;
revoke all on function public.initialize_clinic_treatment_catalogue() from anon, authenticated;

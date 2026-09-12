-- Clinic-scoped administration. No passwords, service keys, or client-side role trust.
begin;
alter table public.membership_permission_overrides drop constraint membership_permission_overrides_permission_check;
alter table public.membership_permission_overrides add constraint membership_permission_overrides_permission_check check(permission in ('patients.view','patients.create','patients.update','patients.dates.edit','patients.delete','clinical.write','treatment_plans.write','treatment_plans.delete','imaging.view','imaging.manage','imaging.delete','pricing.view','pricing.manage','patient_price.override','treatment_discount.apply','finance.view','finance.manage','inventory.view','inventory.manage','appointments.manage','leave.request'));
insert into public.role_permissions(role,permission) select 'admin', unnest(array['patients.dates.edit','imaging.delete','treatment_plans.delete','leave.request']) on conflict do nothing;
insert into public.role_permissions(role,permission) select role, 'leave.request' from unnest(enum_range(null::public.app_role)) role on conflict do nothing;
-- Preserve existing routine date editing; destructive removals now require an explicit grant.
insert into public.role_permissions(role,permission) select role,'patients.dates.edit' from public.role_permissions where permission='patients.update' on conflict do nothing;

-- Administrators cannot delegate permission management or accidentally lock themselves out.
create or replace function public.has_clinic_permission(target_clinic uuid, required_permission text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.memberships m where m.clinic_id=target_clinic and m.user_id=auth.uid() and m.active and
 case when m.role='admin' then true
 when required_permission in ('users.manage','permissions.manage','finance.access.manage','audit.view') then false
 else coalesce((select o.effect='allow' from public.membership_permission_overrides o where o.membership_id=m.id and o.permission=required_permission),exists(select 1 from public.role_permissions r where r.role=m.role and r.permission=required_permission)) end);
$$;
drop policy "admins manage finance inventory staff access" on public.membership_permission_overrides;
create policy "Clinic admins manage overrides" on public.membership_permission_overrides for all to authenticated using(exists(select 1 from public.memberships m where m.id=membership_id and public.has_clinic_role(m.clinic_id,'admin'))) with check(exists(select 1 from public.memberships m where m.id=membership_id and m.role<>'admin' and public.has_clinic_role(m.clinic_id,'admin')));
create policy "Members read own overrides" on public.membership_permission_overrides for select to authenticated using(exists(select 1 from public.memberships m where m.id=membership_id and m.user_id=auth.uid() and m.active));
drop policy "admins can manage clinic memberships" on public.memberships;
create policy "Clinic admins manage memberships" on public.memberships for all to authenticated using(public.has_clinic_role(clinic_id,'admin')) with check(public.has_clinic_role(clinic_id,'admin'));
drop policy "members can view audit logs" on public.audit_log;
create policy "Admins read clinic audit" on public.audit_log for select to authenticated using(public.has_clinic_role(clinic_id,'admin'));

create function public.guard_membership_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and (new.clinic_id<>old.clinic_id or new.organization_id<>old.organization_id or new.user_id<>old.user_id) then raise exception 'Membership identity cannot be changed'; end if;
 if tg_op in ('UPDATE','DELETE') and old.role='admin' and auth.uid() is not null then raise exception 'Administrator memberships are protected'; end if;
 if tg_op<>'DELETE' and new.organization_id is distinct from (select organization_id from public.clinics where id=new.clinic_id) then raise exception 'Clinic and organization do not match'; end if;
 if tg_op='DELETE' then return old; end if;return new;
end;$$;
create trigger guard_membership_change before insert or update or delete on public.memberships for each row execute function public.guard_membership_change();

alter table public.clinic_practitioners add column membership_id uuid references public.memberships(id) on delete set null;
create unique index clinic_practitioners_membership_idx on public.clinic_practitioners(membership_id) where membership_id is not null;
alter table public.clinic_practitioners drop constraint clinic_practitioners_schedule_color_check;
alter table public.clinic_practitioners add constraint clinic_practitioners_schedule_color_check check(schedule_color in ('teal','violet','amber') or schedule_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.clinic_practitioners drop constraint clinic_practitioners_practitioner_role_check;
alter table public.clinic_practitioners add constraint clinic_practitioners_practitioner_role_check check(practitioner_role in ('Doctor','Specialist','Visiting consultant','Hygienist','Assistant','Receptionist','Accountant','Manager'));
alter table public.appointments drop constraint appointments_clinician_color_check;
alter table public.appointments add constraint appointments_clinician_color_check check(clinician_color in ('teal','violet','amber') or clinician_color ~ '^#[0-9A-Fa-f]{6}$');
create function public.guard_practitioner() returns trigger language plpgsql set search_path=public as $$
begin
 if new.organization_id is distinct from (select organization_id from public.clinics where id=new.clinic_id) then raise exception 'Clinic and organization do not match';end if;
 if tg_op='UPDATE' and (new.clinic_id<>old.clinic_id or new.organization_id<>old.organization_id) then raise exception 'Cannot move a staff profile to another clinic';end if;
 if new.membership_id is not null and not exists(select 1 from public.memberships where id=new.membership_id and clinic_id=new.clinic_id) then raise exception 'Login must belong to the same clinic';end if;
 return new;
end;$$;
create trigger guard_practitioner before insert or update on public.clinic_practitioners for each row execute function public.guard_practitioner();

create table public.clinic_schedule_settings(clinic_id uuid primary key references public.clinics(id) on delete cascade, opens time not null default '10:00', closes time not null default '18:00', closed_days integer[] not null default '{0}',check(opens<closes),check(closed_days <@ array[0,1,2,3,4,5,6]));
alter table public.clinic_schedule_settings enable row level security;
revoke all on public.clinic_schedule_settings from anon,authenticated;
grant select,insert,update,delete on public.clinic_schedule_settings to authenticated;
create policy "Members read clinic schedule" on public.clinic_schedule_settings for select to authenticated using(public.is_clinic_member(clinic_id));
create policy "Admins manage clinic schedule" on public.clinic_schedule_settings for all to authenticated using(public.has_clinic_role(clinic_id,'admin')) with check(public.has_clinic_role(clinic_id,'admin'));

-- This table existed in production before its creation was tracked in the repository.
create table if not exists public.staff_leave_requests(id uuid primary key default gen_random_uuid(),clinic_id uuid not null references public.clinics(id) on delete cascade,practitioner_id uuid references public.clinic_practitioners(id) on delete set null,staff_name text not null,start_date date not null,end_date date not null, status text not null default 'pending' check(status in ('pending','approved','rejected')),note text,requested_by uuid references auth.users(id) on delete set null,approved_by uuid references auth.users(id) on delete set null,approved_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(end_date>=start_date));
alter table public.staff_leave_requests add column leave_kind text not null default 'full_day' check(leave_kind in ('full_day','half_day'));
alter table public.staff_leave_requests add column start_time time not null default '00:00';
alter table public.staff_leave_requests add column end_time time not null default '23:59:59';
alter table public.staff_leave_requests add check(start_time<end_time and (leave_kind='full_day' or start_date=end_date));
alter table public.staff_leave_requests enable row level security;
grant select,insert,update,delete on public.staff_leave_requests to authenticated;
drop policy if exists "Admins manage leave requests" on public.staff_leave_requests;
drop policy if exists "Clinic members can view leave requests" on public.staff_leave_requests;
create policy "Members read approved or own leave" on public.staff_leave_requests for select to authenticated using(public.is_clinic_member(clinic_id) and (status='approved' or requested_by=auth.uid() or public.has_clinic_role(clinic_id,'admin')));
create policy "Admins manage clinic leave" on public.staff_leave_requests for all to authenticated using(public.has_clinic_role(clinic_id,'admin')) with check(public.has_clinic_role(clinic_id,'admin'));
create policy "Staff request own leave" on public.staff_leave_requests for insert to authenticated with check(public.has_clinic_permission(clinic_id,'leave.request') and status='pending' and requested_by=auth.uid() and exists(select 1 from public.clinic_practitioners p join public.memberships m on m.id=p.membership_id where p.id=practitioner_id and p.clinic_id=staff_leave_requests.clinic_id and m.user_id=auth.uid() and m.active));
create index staff_leave_clinic_status_idx on public.staff_leave_requests(clinic_id,status,start_date);

create function public.guard_clinic_leave() returns trigger language plpgsql security definer set search_path=public as $$
declare tz text;actor_admin boolean;
begin
 actor_admin:=public.has_clinic_role(new.clinic_id,'admin');
 if tg_op='UPDATE' and (new.clinic_id<>old.clinic_id or new.practitioner_id is distinct from old.practitioner_id or new.requested_by is distinct from old.requested_by) then raise exception 'Leave request identity cannot be changed';end if;
 select timezone into tz from public.clinics where id=new.clinic_id for update;
 if new.practitioner_id is null or not exists(select 1 from public.clinic_practitioners where id=new.practitioner_id and clinic_id=new.clinic_id and active) then raise exception 'Choose an active staff profile in this clinic';end if;
 if tg_op='INSERT' then new.requested_by:=auth.uid();end if;
 if not actor_admin and (new.status<>'pending' or tg_op='UPDATE') then raise exception 'Only administrators approve leave';end if;
 select full_name into new.staff_name from public.clinic_practitioners where id=new.practitioner_id;
 new.approved_by:=null;new.approved_at:=null;
 if new.leave_kind='full_day' then new.start_time:='00:00';new.end_time:='23:59:59';end if;
 if new.status='approved' then
   if exists(select 1 from public.appointments a where a.clinic_id=new.clinic_id and a.clinician_name=new.staff_name and a.status<>'cancelled' and exists(select 1 from generate_series(new.start_date::timestamp,new.end_date::timestamp,interval '1 day') d where tsrange(a.scheduled_at at time zone tz,(a.scheduled_at+make_interval(mins=>a.duration_minutes)) at time zone tz,'[)') && tsrange(d::date+new.start_time,case when new.leave_kind='full_day' then d::date+interval '1 day' else d::date+new.end_time end,'[)'))) then raise exception 'Move or cancel overlapping appointments before approving leave';end if;
   new.approved_by:=auth.uid();new.approved_at:=now();
 end if;
 new.updated_at:=now();return new;
end;$$;
create trigger guard_clinic_leave before insert or update on public.staff_leave_requests for each row execute function public.guard_clinic_leave();
create function public.guard_appointment_availability() returns trigger language plpgsql security definer set search_path=public as $$
declare tz text;
begin
 if new.status='cancelled' then return new;end if;
 if exists(select 1 from public.clinic_practitioners p where p.clinic_id=new.clinic_id and p.full_name=new.clinician_name and not p.active) then raise exception 'This doctor is not active in this clinic';end if;
 select timezone into tz from public.clinics where id=new.clinic_id for update;
 if exists(select 1 from public.staff_leave_requests l where l.clinic_id=new.clinic_id and l.staff_name=new.clinician_name and l.status='approved' and exists(select 1 from generate_series(l.start_date::timestamp,l.end_date::timestamp,interval '1 day') d where tsrange(new.scheduled_at at time zone tz,(new.scheduled_at+make_interval(mins=>new.duration_minutes)) at time zone tz,'[)') && tsrange(d::date+l.start_time,case when l.leave_kind='full_day' then d::date+interval '1 day' else d::date+l.end_time end,'[)'))) then raise exception 'This doctor has approved leave during the selected appointment';end if;
 return new;
end;$$;
create trigger guard_appointment_availability before insert or update on public.appointments for each row execute function public.guard_appointment_availability();

-- Invoker RPC returns only the signed-in member's effective access.
create function public.my_clinic_permissions(target_clinic uuid) returns setof text language sql stable security invoker set search_path=public as $$
 select p from (select distinct permission p from public.role_permissions union select permission from public.membership_permission_overrides) permissions where public.has_clinic_permission(target_clinic,p);
$$;
-- Definer needed to resolve names/emails which ordinary members cannot read.
create function public.clinic_admin_team(target_clinic uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.has_clinic_role(target_clinic,'admin') then raise exception 'Administrator access required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(rowdata order by rowdata->>'full_name') from(select jsonb_build_object('id',m.id,'user_id',m.user_id,'role',m.role,'active',m.active,'full_name',coalesce(p.full_name,r.full_name),'email',u.email,'permissions',(select coalesce(jsonb_agg(k.permission),'[]') from (select distinct permission from public.role_permissions union select permission from public.membership_permission_overrides) k where m.role='admin' or coalesce((select o.effect='allow' from public.membership_permission_overrides o where o.membership_id=m.id and o.permission=k.permission),exists(select 1 from public.role_permissions rp where rp.role=m.role and rp.permission=k.permission)))) rowdata from public.memberships m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id left join public.clinic_practitioners r on r.membership_id=m.id where m.clinic_id=target_clinic) t),'[]');
end;$$;
create function public.set_clinic_member_access(target_clinic uuid,target_member uuid,changes jsonb) returns void language plpgsql security definer set search_path=public as $$
declare entry record;m public.memberships;
begin
 if not public.has_clinic_role(target_clinic,'admin') then raise exception 'Administrator access required' using errcode='42501';end if;
 select * into m from public.memberships where id=target_member and clinic_id=target_clinic for update;
 if m.id is null or m.role='admin' then raise exception 'Choose a non-administrator in this clinic';end if;
 if jsonb_typeof(changes)<>'object' then raise exception 'Invalid permissions';end if;
 for entry in select * from jsonb_each(changes) loop
  if jsonb_typeof(entry.value)<>'boolean' then raise exception 'Permission values must be Yes or No';end if;
  insert into public.membership_permission_overrides(membership_id,permission,effect,granted_by,updated_at) values(m.id,entry.key,case when entry.value='true'::jsonb then 'allow' else 'deny' end,auth.uid(),now()) on conflict(membership_id,permission) do update set effect=excluded.effect,granted_by=excluded.granted_by,updated_at=excluded.updated_at;
 end loop;
 insert into public.audit_log(organization_id,clinic_id,actor_user_id,action,entity_type,entity_id,metadata) values(m.organization_id,target_clinic,auth.uid(),'admin.permissions_updated','membership',m.id,jsonb_build_object('permissions',changes,'member_name',(select full_name from public.profiles where id=m.user_id)));
end;$$;
create function public.set_clinic_member_status(target_clinic uuid,target_member uuid,enabled boolean) returns void language plpgsql security definer set search_path=public as $$
declare m public.memberships;
begin
 if not public.has_clinic_role(target_clinic,'admin') then raise exception 'Administrator access required' using errcode='42501';end if;
 update public.memberships set active=enabled where id=target_member and clinic_id=target_clinic and role<>'admin' returning * into m;
 if m.id is null then raise exception 'Choose a non-administrator in this clinic';end if;
 update public.clinic_practitioners set active=enabled where membership_id=m.id;
 insert into public.audit_log(organization_id,clinic_id,actor_user_id,action,entity_type,entity_id) values(m.organization_id,target_clinic,auth.uid(),case when enabled then 'admin.access_restored' else 'admin.access_suspended' end,'membership',m.id);
end;$$;
create function public.link_clinic_practitioner(target_clinic uuid,target_member uuid,target_practitioner uuid,chosen_colour text) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.has_clinic_role(target_clinic,'admin') then raise exception 'Administrator access required' using errcode='42501';end if;
 perform 1 from public.clinics where id=target_clinic for update;
 if not exists(select 1 from public.memberships where id=target_member and clinic_id=target_clinic) then raise exception 'Login not in this clinic';end if;
 if target_practitioner is not null and not exists(select 1 from public.clinic_practitioners where id=target_practitioner and clinic_id=target_clinic and (membership_id is null or membership_id=target_member)) then raise exception 'Choose an unlinked profile in this clinic';end if;
 update public.clinic_practitioners set membership_id=null where membership_id=target_member;
 update public.clinic_practitioners set membership_id=target_member,schedule_color=chosen_colour where id=target_practitioner;
end;$$;
create function public.add_clinic_member(target_clinic uuid,account_email text,staff_name text,member_role public.app_role,chosen_colour text) returns uuid language plpgsql security definer set search_path=public as $$
declare account_id uuid;org uuid;member_id uuid;
begin
 if not public.has_clinic_role(target_clinic,'admin') then raise exception 'Administrator access required' using errcode='42501';end if;
 if member_role='admin' then raise exception 'Administrator accounts are protected';end if;
 select id into account_id from auth.users where lower(email)=lower(trim(account_email)) and email_confirmed_at is not null;
 if account_id is null then raise exception 'No verified account found. Ask this person to sign up and verify their email first.';end if;
 select organization_id into org from public.clinics where id=target_clinic;
 insert into public.memberships(organization_id,clinic_id,user_id,role) values(org,target_clinic,account_id,member_role) returning id into member_id;
 insert into public.clinic_practitioners(organization_id,clinic_id,full_name,practitioner_role,schedule_color,membership_id) values(org,target_clinic,trim(staff_name),initcap(member_role::text),chosen_colour,member_id) on conflict(clinic_id,full_name) do update set membership_id=excluded.membership_id,schedule_color=excluded.schedule_color where clinic_practitioners.membership_id is null;
 if not exists(select 1 from public.clinic_practitioners where membership_id=member_id) then raise exception 'This staff name is already linked to another login';end if;
 insert into public.audit_log(organization_id,clinic_id,actor_user_id,action,entity_type,entity_id,metadata) values(org,target_clinic,auth.uid(),'admin.member_added','membership',member_id,jsonb_build_object('member_name',staff_name));
 return member_id;
end;$$;
create function public.save_clinic_settings(target_clinic uuid,clinic_name text,opens time,closes time,closed_days integer[]) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.has_clinic_role(target_clinic,'admin') then raise exception 'Administrator access required' using errcode='42501';end if;
 if length(trim(clinic_name)) not between 2 and 120 then raise exception 'Clinic name must be 2–120 characters';end if;
 update public.clinics set name=trim(clinic_name),updated_at=now() where id=target_clinic;
 insert into public.clinic_schedule_settings values(target_clinic,opens,closes,closed_days) on conflict(clinic_id) do update set opens=excluded.opens,closes=excluded.closes,closed_days=excluded.closed_days;
end;$$;

-- Patient column-level permissions supplement RLS and cannot be bypassed with direct API writes.
drop policy "authorized users can update patients" on public.patients;
create policy "Authorized patient updates" on public.patients for update to authenticated using(public.has_clinic_permission(clinic_id,'patients.view') and (public.has_clinic_permission(clinic_id,'patients.update') or public.has_clinic_permission(clinic_id,'clinical.write') or public.has_clinic_permission(clinic_id,'patients.dates.edit') or public.has_clinic_permission(clinic_id,'treatment_plans.write'))) with check(public.is_clinic_member(clinic_id));
create function public.guard_patient_fields() returns trigger language plpgsql set search_path=public as $$
declare k text;v jsonb;previous jsonb:=to_jsonb(old);
begin
 if new.clinic_id<>old.clinic_id or new.organization_id<>old.organization_id or new.id<>old.id or new.created_by is distinct from old.created_by then raise exception 'Patient record ownership cannot be changed';end if;
 for k,v in select * from jsonb_each(to_jsonb(new)) loop
 if v is not distinct from previous->k or k='updated_at' then continue;end if;
 if k in ('date_of_birth','next_follow_up_date','created_at') then
  if not public.has_clinic_permission(new.clinic_id,'patients.dates.edit') then raise exception 'You do not have permission to edit patient dates' using errcode='42501';end if;
 elsif k='treatment_advised' then
  if not public.has_clinic_permission(new.clinic_id,'treatment_plans.write') then raise exception 'You do not have permission to edit treatment plans' using errcode='42501';end if;
 elsif k in ('chief_complaint','history_present_illness','medical_history','clinical_findings','primary_diagnosis','final_diagnosis','timeline_notes','weight_kg','blood_pressure','current_medications','illness_history','allergies','major_surgeries','investigations_advised') then
  if not public.has_clinic_permission(new.clinic_id,'clinical.write') then raise exception 'You do not have permission to edit clinical files' using errcode='42501';end if;
 elsif not public.has_clinic_permission(new.clinic_id,'patients.update') then raise exception 'You do not have permission to edit patient information' using errcode='42501';end if;
 end loop;return new;
end;$$;
create trigger guard_patient_fields before update on public.patients for each row execute function public.guard_patient_fields();

-- Files must use the same effective overrides as their database records.
drop policy "authorized users can delete patient imaging" on public.patient_imaging;
create policy "Authorized photo removal" on public.patient_imaging for delete to authenticated using(public.has_clinic_permission(clinic_id,'imaging.delete'));
drop policy "clinic members can read patient imaging files" on storage.objects;
drop policy "authorized users can upload patient imaging files" on storage.objects;
drop policy "authorized users can delete patient imaging files" on storage.objects;
create policy "Clinic imaging file read" on storage.objects for select to authenticated using(bucket_id='patient-imaging' and exists(select 1 from public.clinics c where c.id::text=(storage.foldername(storage.objects.name))[1] and public.has_clinic_permission(c.id,'imaging.view')));
create policy "Clinic imaging file upload" on storage.objects for insert to authenticated with check(bucket_id='patient-imaging' and exists(select 1 from public.clinics c where c.id::text=(storage.foldername(storage.objects.name))[1] and public.has_clinic_permission(c.id,'imaging.manage')));
create policy "Clinic imaging file removal" on storage.objects for delete to authenticated using(bucket_id='patient-imaging' and exists(select 1 from public.clinics c where c.id::text=(storage.foldername(storage.objects.name))[1] and public.has_clinic_permission(c.id,'imaging.delete')));

-- The old ALL policy allowed finance viewers to DELETE: use operation-specific policies.
drop policy "finance users manage transactions" on public.financial_transactions;
drop policy "finance users manage compensation" on public.staff_compensation;
do $$declare t text;begin foreach t in array array['financial_transactions','staff_compensation'] loop
 execute format('create policy "Finance read" on public.%I for select to authenticated using(public.has_clinic_permission(clinic_id,''finance.view''))',t);
 execute format('create policy "Finance insert" on public.%I for insert to authenticated with check(public.has_clinic_permission(clinic_id,''finance.manage''))',t);
 execute format('create policy "Finance update" on public.%I for update to authenticated using(public.has_clinic_permission(clinic_id,''finance.manage'')) with check(public.has_clinic_permission(clinic_id,''finance.manage''))',t);
 execute format('create policy "Finance delete" on public.%I for delete to authenticated using(public.has_clinic_permission(clinic_id,''finance.manage''))',t);
 end loop;end;$$;

create function public.guard_treatment_prices() returns trigger language plpgsql set search_path=public as $$
declare catalog_price numeric;
begin
 if tg_op='DELETE' then
  if not public.has_clinic_permission(old.clinic_id,'treatment_plans.delete') then raise exception 'Treatment removal requires permission' using errcode='42501';end if;return old;
 end if;
 if tg_op='UPDATE' and (new.clinic_id<>old.clinic_id or new.patient_id<>old.patient_id or new.organization_id<>old.organization_id) then raise exception 'Treatment ownership cannot be changed';end if;
 if tg_table_name='patient_treatment_plans' then
  if (tg_op='INSERT' and new.additional_adjustment<>0) or (tg_op='UPDATE' and new.additional_adjustment<>old.additional_adjustment) then
   if not public.has_clinic_permission(new.clinic_id,'treatment_discount.apply') then raise exception 'Estimate adjustments require permission' using errcode='42501';end if;
  end if;
 else
  if not exists(select 1 from public.patient_treatment_plans p where p.id=new.treatment_plan_id and p.clinic_id=new.clinic_id and p.patient_id=new.patient_id) then raise exception 'Treatment plan does not match patient';end if;
  if (tg_op='INSERT' and new.discount_percent<>0) or (tg_op='UPDATE' and new.discount_percent<>old.discount_percent) then
   if not public.has_clinic_permission(new.clinic_id,'treatment_discount.apply') then raise exception 'Discounts require permission' using errcode='42501';end if;
  end if;
  if tg_op='INSERT' or new.unit_price_snapshot is distinct from old.unit_price_snapshot or new.treatment_catalogue_id is distinct from old.treatment_catalogue_id then
   select standard_price into catalog_price from public.treatment_catalogue where id=new.treatment_catalogue_id and clinic_id=new.clinic_id;
   if (catalog_price is null or new.unit_price_snapshot<>catalog_price) and not public.has_clinic_permission(new.clinic_id,'patient_price.override') then raise exception 'Custom treatment prices require permission' using errcode='42501';end if;
  end if;
  new.discount_amount:=round(round(new.quantity*new.unit_price_snapshot,2)*new.discount_percent/100,2);
  new.final_price:=greatest(0,round(new.quantity*new.unit_price_snapshot,2)-new.discount_amount);
 end if;return new;
end;$$;
create trigger guard_treatment_prices before insert or update or delete on public.patient_treatment_items for each row execute function public.guard_treatment_prices();
create trigger guard_treatment_adjustments before insert or update or delete on public.patient_treatment_plans for each row execute function public.guard_treatment_prices();

-- Separate plan read/write/delete so denying record viewing cannot be bypassed by ALL policies.
drop policy "clinical staff manage treatment plans" on public.patient_treatment_plans;
drop policy "clinical staff manage treatment items" on public.patient_treatment_items;
do $$declare t text;begin foreach t in array array['patient_treatment_plans','patient_treatment_items'] loop
 execute format('create policy "Treatment insert" on public.%I for insert to authenticated with check(public.has_clinic_permission(clinic_id,''treatment_plans.write'') and public.has_clinic_permission(clinic_id,''patients.view''))',t);
 execute format('create policy "Treatment update" on public.%I for update to authenticated using(public.has_clinic_permission(clinic_id,''treatment_plans.write'') and public.has_clinic_permission(clinic_id,''patients.view'')) with check(public.has_clinic_permission(clinic_id,''treatment_plans.write''))',t);
 execute format('create policy "Treatment delete" on public.%I for delete to authenticated using(public.has_clinic_permission(clinic_id,''treatment_plans.delete'') and public.has_clinic_permission(clinic_id,''patients.view''))',t);
end loop;end;$$;
-- Price auditing must succeed for explicitly authorised price managers too.
create or replace function public.track_treatment_price_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not public.has_clinic_permission(new.clinic_id,'pricing.manage') then raise exception 'Price management requires permission' using errcode='42501';end if;
 new.updated_at:=now();new.updated_by:=auth.uid();
 if new.standard_price is distinct from old.standard_price then
  insert into public.treatment_price_history(treatment_catalogue_id,organization_id,clinic_id,previous_price,new_price,changed_by) values(new.id,new.organization_id,new.clinic_id,old.standard_price,new.standard_price,auth.uid());
 end if;return new;
end;$$;
revoke all on function public.track_treatment_price_change() from public,anon,authenticated;
create function public.guard_imaging_identity() returns trigger language plpgsql set search_path=public as $$
begin
 if new.clinic_id<>old.clinic_id or new.organization_id<>old.organization_id or new.patient_id<>old.patient_id or new.storage_path<>old.storage_path then raise exception 'Photo ownership and stored file cannot be replaced. Remove and upload with the required permissions.';end if;return new;
end;$$;
create trigger guard_imaging_identity before update on public.patient_imaging for each row execute function public.guard_imaging_identity();
revoke all on function public.guard_imaging_identity() from public,anon,authenticated;

-- View-only inventory access cannot remove stock or purchase history.
drop policy "inventory users manage items" on public.inventory_items;
drop policy "inventory users manage purchases" on public.inventory_purchases;
drop policy "inventory users manage movements" on public.inventory_stock_movements;
do $$declare t text;begin foreach t in array array['inventory_items','inventory_purchases'] loop
 execute format('create policy "Inventory read" on public.%I for select to authenticated using(public.has_clinic_permission(clinic_id,''inventory.view''))',t);
 execute format('create policy "Inventory insert" on public.%I for insert to authenticated with check(public.has_clinic_permission(clinic_id,''inventory.manage''))',t);
 execute format('create policy "Inventory update" on public.%I for update to authenticated using(public.has_clinic_permission(clinic_id,''inventory.manage'')) with check(public.has_clinic_permission(clinic_id,''inventory.manage''))',t);
 execute format('create policy "Inventory delete" on public.%I for delete to authenticated using(public.has_clinic_permission(clinic_id,''inventory.manage''))',t);
end loop;end;$$;
create policy "Stock history read" on public.inventory_stock_movements for select to authenticated using(exists(select 1 from public.inventory_items i where i.id=item_id and public.has_clinic_permission(i.clinic_id,'inventory.view')));
create policy "Stock history insert" on public.inventory_stock_movements for insert to authenticated with check(exists(select 1 from public.inventory_items i where i.id=item_id and public.has_clinic_permission(i.clinic_id,'inventory.manage')));
-- Stock movements are append-only: use a new adjustment to correct a count.
drop policy "admins manage treatment categories" on public.treatment_categories;
drop policy "admins manage treatment catalogue" on public.treatment_catalogue;
do $$declare t text;begin foreach t in array array['treatment_categories','treatment_catalogue'] loop
 execute format('create policy "Pricing insert" on public.%I for insert to authenticated with check(public.has_clinic_permission(clinic_id,''pricing.manage''))',t);
 execute format('create policy "Pricing update" on public.%I for update to authenticated using(public.has_clinic_permission(clinic_id,''pricing.manage'')) with check(public.has_clinic_permission(clinic_id,''pricing.manage''))',t);
 execute format('create policy "Pricing delete" on public.%I for delete to authenticated using(public.has_clinic_permission(clinic_id,''pricing.manage''))',t);
end loop;end;$$;

-- Trigger helpers are not API endpoints; RPCs authenticate and authorize before reading/writing.
do $$declare f record;begin for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('guard_membership_change','guard_practitioner','guard_clinic_leave','guard_appointment_availability','guard_patient_fields','guard_treatment_prices','my_clinic_permissions','clinic_admin_team','set_clinic_member_access','set_clinic_member_status','link_clinic_practitioner','add_clinic_member','save_clinic_settings') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.proname not like 'guard_%' then execute format('grant execute on function %s to authenticated',f.signature);end if;
end loop;end;$$;
commit;

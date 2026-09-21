-- Clinic identities take precedence over account-wide display names.
create or replace function public.clinic_admin_team(target_clinic uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.has_clinic_role(target_clinic,'admin') then raise exception 'Administrator access required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(rowdata order by rowdata->>'full_name') from(select jsonb_build_object('id',m.id,'user_id',m.user_id,'role',m.role,'active',m.active,'full_name',coalesce(nullif(trim(r.full_name),''),p.full_name),'email',u.email,'permissions',(select coalesce(jsonb_agg(k.permission),'[]') from (select distinct permission from public.role_permissions union select permission from public.membership_permission_overrides) k where m.role='admin' or coalesce((select o.effect='allow' from public.membership_permission_overrides o where o.membership_id=m.id and o.permission=k.permission),exists(select 1 from public.role_permissions rp where rp.role=m.role and rp.permission=k.permission)))) rowdata from public.memberships m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id left join public.clinic_practitioners r on r.membership_id=m.id where m.clinic_id=target_clinic) t),'[]');
end;$$;
create or replace function public.add_clinic_member(target_clinic uuid,account_email text,staff_name text,member_role public.app_role,chosen_colour text) returns uuid language plpgsql security definer set search_path=public as $$
declare account_id uuid;org uuid;member_id uuid;
begin
 if not public.has_clinic_role(target_clinic,'admin') then raise exception 'Administrator access required' using errcode='42501';end if;
 if length(trim(staff_name)) not between 2 and 120 then raise exception 'Enter a staff name between 2 and 120 characters';end if;
 if member_role='admin' then raise exception 'Administrator accounts are protected';end if;
 select id into account_id from auth.users where lower(email)=lower(trim(account_email)) and email_confirmed_at is not null;
 if account_id is null then raise exception 'No verified account found. Ask this person to sign up and verify their email first.';end if;
 select organization_id into org from public.clinics where id=target_clinic;
 insert into public.memberships(organization_id,clinic_id,user_id,role) values(org,target_clinic,account_id,member_role) returning id into member_id;
 insert into public.clinic_practitioners(organization_id,clinic_id,full_name,practitioner_role,schedule_color,membership_id) values(org,target_clinic,trim(staff_name),initcap(member_role::text),chosen_colour,member_id) on conflict(clinic_id,full_name) do update set membership_id=excluded.membership_id,schedule_color=excluded.schedule_color,active=true,practitioner_role=excluded.practitioner_role where clinic_practitioners.membership_id is null;
 if not exists(select 1 from public.clinic_practitioners where membership_id=member_id) then raise exception 'This staff name is already linked to another login';end if;
 insert into public.audit_log(organization_id,clinic_id,actor_user_id,action,entity_type,entity_id,metadata) values(org,target_clinic,auth.uid(),'admin.member_added','membership',member_id,jsonb_build_object('member_name',staff_name));
 return member_id;
end;$$;

-- Explicit admin checks, scoped targets, and restricted execution protect these
-- atomic operations across membership, roster, appointments and audit records.
create function public.edit_clinic_member(target_clinic uuid,target_member uuid,staff_name text,member_role public.app_role)
returns void language plpgsql security definer set search_path=public as $$
declare m public.memberships; p public.clinic_practitioners; new_name text := trim(staff_name);
begin
 if auth.uid() is null or not public.has_clinic_role(target_clinic,'admin') then raise exception 'Administrator access required' using errcode='42501';end if;
 if new_name is null or length(new_name) not between 2 and 120 then raise exception 'Enter a staff name between 2 and 120 characters';end if;
 perform 1 from public.clinics where id=target_clinic for update;
 select * into m from public.memberships where id=target_member and clinic_id=target_clinic for update;
 if m.id is null then raise exception 'Member not found in this clinic';end if;
 if member_role is null or (m.role='admin' and member_role<>'admin') or (m.role<>'admin' and member_role='admin') then raise exception 'Administrator roles are protected';end if;
 select * into p from public.clinic_practitioners where membership_id=m.id and clinic_id=target_clinic for update;
 if p.id is null then
  insert into public.clinic_practitioners(organization_id,clinic_id,full_name,practitioner_role,membership_id,active)
  values(m.organization_id,target_clinic,new_name,case when member_role='admin' then 'Manager' else initcap(member_role::text) end,m.id,m.active);
 else
  update public.clinic_practitioners set full_name=new_name,practitioner_role=case when member_role='admin' then p.practitioner_role else initcap(member_role::text) end where id=p.id;
  if p.full_name<>new_name then
   -- Appointment availability currently uses names; keep it linked after edits.
   update public.appointments set clinician_name=new_name where clinic_id=target_clinic and clinician_name=p.full_name;
   update public.staff_leave_requests set staff_name=new_name where clinic_id=target_clinic and practitioner_id=p.id;
  end if;
 end if;
 if m.role<>'admin' and m.role<>member_role then update public.memberships set role=member_role where id=m.id;end if;
 insert into public.audit_log(organization_id,clinic_id,actor_user_id,action,entity_type,entity_id,metadata)
 values(m.organization_id,target_clinic,auth.uid(),'admin.member_edited','membership',m.id,jsonb_build_object('member_name',new_name,'previous_name',p.full_name,'role',member_role));
end;$$;

create function public.remove_clinic_member(target_clinic uuid,target_member uuid)
returns void language plpgsql security definer set search_path=public as $$
declare m public.memberships;
begin
 if auth.uid() is null or not public.has_clinic_role(target_clinic,'admin') then raise exception 'Administrator access required' using errcode='42501';end if;
 perform 1 from public.clinics where id=target_clinic for update;
 select * into m from public.memberships where id=target_member and clinic_id=target_clinic for update;
 if m.id is null or m.role='admin' or m.user_id=auth.uid() then raise exception 'Choose another non-administrator in this clinic';end if;
 update public.clinic_practitioners set active=false where membership_id=m.id and clinic_id=target_clinic;
 insert into public.audit_log(organization_id,clinic_id,actor_user_id,action,entity_type,entity_id)
 values(m.organization_id,target_clinic,auth.uid(),'admin.member_removed','membership',m.id);
 delete from public.memberships where id=m.id and clinic_id=target_clinic;
end;$$;
revoke all on function public.edit_clinic_member(uuid,uuid,text,public.app_role) from public,anon;
revoke all on function public.remove_clinic_member(uuid,uuid) from public,anon;
grant execute on function public.edit_clinic_member(uuid,uuid,text,public.app_role) to authenticated;
grant execute on function public.remove_clinic_member(uuid,uuid) to authenticated;

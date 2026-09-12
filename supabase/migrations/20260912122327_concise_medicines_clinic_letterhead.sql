begin;
alter table public.dental_medicine_references add column default_dose text not null default '',add column frequency text not null default '' check(frequency in ('','OD','BID','TID','QID','PRN'));
alter table public.clinic_medicines add column default_dose text not null default '' check(length(default_dose)<=120),add column frequency text not null default '' check(frequency in ('','OD','BID','TID','QID','PRN'));
-- Compact forms of the previously sourced adult references; not patient-specific prescriptions.
update public.dental_medicine_references set default_dose=case code
 when 'paracetamol-500' then '1,000 mg (2 × 500 mg)' when 'ibuprofen-400' then '400 mg' when 'diclofenac-50' then '50 mg'
 when 'amoxicillin-500' then '500 mg' when 'metronidazole-400' then '400 mg' when 'miconazole-20' then 'Pea-sized application (20 mg/g gel)'
 when 'nystatin-100000' then '1 mL (100,000 units)' when 'chlorhexidine-02' then '10 mL (0.2% rinse)' end,
 frequency=case when code in ('amoxicillin-500','metronidazole-400','diclofenac-50') then 'TID' when code='chlorhexidine-02' then 'BID' else 'QID' end;
alter table public.clinics add column address text not null default '' check(length(address)<=500),add column phone text not null default '' check(length(phone)<=60),add column logo_path text check(length(logo_path)<=250);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('clinic-logos','clinic-logos',false,1048576,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create policy "Members read their clinic logos" on storage.objects for select to authenticated using(bucket_id='clinic-logos' and exists(select 1 from public.clinics c where c.id::text=(storage.foldername(storage.objects.name))[1] and public.is_clinic_member(c.id)));
create policy "Admins upload clinic logos" on storage.objects for insert to authenticated with check(bucket_id='clinic-logos' and exists(select 1 from public.clinics c where c.id::text=(storage.foldername(storage.objects.name))[1] and public.has_clinic_role(c.id,'admin')));
-- Append-only files prevent saved paths from being overwritten. Only admins can remove unused uploads.
create policy "Admins remove clinic logos" on storage.objects for delete to authenticated using(bucket_id='clinic-logos' and exists(select 1 from public.clinics c where c.id::text=(storage.foldername(storage.objects.name))[1] and public.has_clinic_role(c.id,'admin')));
create function private.save_clinic_letterhead(target_clinic uuid,clinic_address text,clinic_phone text,clinic_logo_path text) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not public.has_clinic_role(target_clinic,'admin') then raise exception 'Administrator access required' using errcode='42501';end if;
 if length(coalesce(clinic_address,''))>500 or length(coalesce(clinic_phone,''))>60 then raise exception 'Clinic contact details are too long';end if;
 if clinic_logo_path is not null and (split_part(clinic_logo_path,'/',1)<>target_clinic::text or not exists(select 1 from storage.objects where bucket_id='clinic-logos' and name=clinic_logo_path)) then raise exception 'Choose an uploaded logo from this clinic';end if;
 update public.clinics set address=trim(coalesce(clinic_address,'')),phone=trim(coalesce(clinic_phone,'')),logo_path=clinic_logo_path,updated_at=now() where id=target_clinic;
end $$;
revoke all on function private.save_clinic_letterhead(uuid,text,text,text) from public,anon;
grant execute on function private.save_clinic_letterhead(uuid,text,text,text) to authenticated;
create function public.save_clinic_profile(target_clinic uuid,clinic_name text,opens time,closes time,closed_days integer[],clinic_address text,clinic_phone text,clinic_logo_path text) returns void language plpgsql security invoker set search_path='' as $$begin
 perform public.save_clinic_settings(target_clinic,clinic_name,opens,closes,closed_days);
 perform private.save_clinic_letterhead(target_clinic,clinic_address,clinic_phone,clinic_logo_path);
end $$;
revoke all on function public.save_clinic_profile(uuid,text,time,time,integer[],text,text,text) from public,anon;
grant execute on function public.save_clinic_profile(uuid,text,time,time,integer[],text,text,text) to authenticated;
commit;

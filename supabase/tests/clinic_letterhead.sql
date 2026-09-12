-- Synthetic fixture only. Run in a disposable migrated database; rolls back all records.
begin;
insert into auth.users(id,email,email_confirmed_at) values('10000000-0000-0000-0000-000000000001','admin@example.test',now()),('10000000-0000-0000-0000-000000000002','doctor@example.test',now()),('10000000-0000-0000-0000-000000000003','outside@example.test',now()),('10000000-0000-0000-0000-000000000004','new@example.test',now());
insert into organizations(id,name,slug) values('20000000-0000-0000-0000-000000000001','Test','test-admin-controls');
insert into clinics(id,organization_id,name) values('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Test clinic'),('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Other clinic');
insert into memberships(id,organization_id,clinic_id,user_id,role) values('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','admin'),('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','doctor'),('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','admin');
insert into clinic_practitioners(id,organization_id,clinic_id,full_name,membership_id) values('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Dr Test','40000000-0000-0000-0000-000000000002');
insert into patients(id,organization_id,clinic_id,first_name,patient_number) values('60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Synthetic','QA-1');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
insert into storage.objects(bucket_id,name) values('clinic-logos','30000000-0000-0000-0000-000000000001/logo.png');
select save_clinic_profile('30000000-0000-0000-0000-000000000001','Updated clinic','09:00','18:00','{0}','Test address','12345','30000000-0000-0000-0000-000000000001/logo.png');
do $$begin
 if not exists(select 1 from clinics where name='Updated clinic' and address='Test address' and phone='12345' and logo_path is not null) then raise exception 'Profile not saved';end if;
 begin perform save_clinic_profile('30000000-0000-0000-0000-000000000001','Should rollback','10:00','18:00','{0}','Bad','Bad','30000000-0000-0000-0000-000000000002/logo.png');raise exception 'FAIL foreign logo';exception when raise_exception then if sqlerrm='FAIL foreign logo' then raise;end if;end;
 if exists(select 1 from clinics where name='Should rollback') then raise exception 'Profile was not atomic';end if;
 if (select count(*) from dental_medicine_references where default_dose<>'' and frequency<>'')<>8 then raise exception 'Incomplete compact catalogue';end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
do $$begin
 if (select count(*) from storage.objects where bucket_id='clinic-logos')<>1 then raise exception 'Member cannot read logo';end if;
 begin perform save_clinic_profile('30000000-0000-0000-0000-000000000001','Denied','09:00','18:00','{0}','x','x',null);raise exception 'FAIL staff profile edit';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name) values('clinic-logos','30000000-0000-0000-0000-000000000001/denied.png');raise exception 'FAIL staff upload';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
do $$begin
 if exists(select 1 from storage.objects where bucket_id='clinic-logos') then raise exception 'Foreign branch read logo';end if;
end $$;
rollback;

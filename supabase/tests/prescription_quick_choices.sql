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
insert into clinic_prescription_choices(clinic_id,medicine_key,item) values('30000000-0000-0000-0000-000000000001','ref:clinic-amoxiclav-625','{"medicine_key":"ref:clinic-amoxiclav-625","name":"Amoxiclav","strength":"625 mg","form":"Tablet","route":"Oral","dose":"1 tablet","frequency":"BID","duration":"3 days","instructions":"After meals","print_timing":"After meals"}');
insert into patient_prescriptions(clinic_id,patient_id,prescribed_on,prescriber_name,items,created_by) values
('30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',current_date,'Doctor','[{"medicine_key":"ref:clinic-amoxiclav-625","name":"Amoxiclav","strength":"625 mg","form":"Tablet","route":"Oral","dose":"1 tablet","frequency":"BID","duration":"3 days","instructions":"After meals","print_timing":"After meals"}]','10000000-0000-0000-0000-000000000001'),
('30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',current_date-1,'Doctor','[{"medicine_key":"ref:clinic-amoxiclav-625","name":"Amoxiclav","strength":"625 mg","form":"Tablet","route":"Oral","dose":"1 tablet","frequency":"BID","duration":"3 days","instructions":"After meals","print_timing":"After meals"}]','10000000-0000-0000-0000-000000000001');
do $$begin
 if (select count(*) from patient_prescriptions where patient_id='60000000-0000-0000-0000-000000000001')<>2 then raise exception 'Dated prescriptions not preserved';end if;
 if not exists(select 1 from clinic_prescription_choices where item->>'duration'='3 days') then raise exception 'Quick choice not saved';end if;
end;$$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
do $$begin
 if exists(select 1 from clinic_prescription_choices where clinic_id='30000000-0000-0000-0000-000000000001') then raise exception 'Cross clinic quick choice leak';end if;
 begin insert into clinic_prescription_choices(clinic_id,medicine_key,item) values('30000000-0000-0000-0000-000000000001','wrong','{}');raise exception 'FAIL cross-clinic write';exception when insufficient_privilege then null;end;
end;$$;
rollback;

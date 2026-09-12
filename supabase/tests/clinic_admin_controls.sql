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
select set_clinic_member_access('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','{"patients.update":false,"patients.dates.edit":false,"clinical.write":true,"finance.view":true,"finance.manage":false,"imaging.delete":false,"treatment_discount.apply":false,"patient_price.override":false}');
select save_clinic_settings('30000000-0000-0000-0000-000000000001','Test clinic','09:00','18:00','{0}');
select link_clinic_practitioner('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001','#ed65ac');
select add_clinic_member('30000000-0000-0000-0000-000000000001','new@example.test','New Staff','assistant','#12ab56');
do $$begin
 if jsonb_array_length(clinic_admin_team('30000000-0000-0000-0000-000000000001'))<>3 then raise exception 'Team did not return clinic members';end if;
 begin perform set_clinic_member_access('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','{"patients.update":true,"users.manage":true}');raise exception 'FAIL escalation accepted';exception when check_violation then null;end;
 if exists(select 1 from membership_permission_overrides where membership_id='40000000-0000-0000-0000-000000000002' and permission='patients.update' and effect='allow') then raise exception 'Batch did not roll back';end if;
 begin perform set_clinic_member_status('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',false);raise exception 'FAIL admin suspended';exception when raise_exception then if sqlerrm='FAIL admin suspended' then raise;end if;end;
end;$$;
insert into financial_transactions(id,clinic_id,type,category,amount,transaction_date) values('70000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','income','Test',100,current_date);
insert into patient_imaging(id,organization_id,clinic_id,patient_id,asset_type,file_name,storage_path) values('80000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','intraoral_photo','test.jpg','30000000-0000-0000-0000-000000000001/test.jpg');
insert into storage.objects(bucket_id,name) values('patient-imaging','30000000-0000-0000-0000-000000000001/test.jpg');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
do $$declare n int;begin
 if has_clinic_permission('30000000-0000-0000-0000-000000000001','patients.update') then raise exception 'Deny did not override role';end if;
 begin perform clinic_admin_team('30000000-0000-0000-0000-000000000001');raise exception 'FAIL doctor read admin directory';exception when insufficient_privilege then null;end;
 begin perform set_clinic_member_access('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','{"patients.update":true}');raise exception 'FAIL self grant';exception when insufficient_privilege then null;end;
 update patients set chief_complaint='Allowed clinical note' where id='60000000-0000-0000-0000-000000000001';get diagnostics n=row_count;if n<>1 then raise exception 'Allowed clinical update blocked';end if;
 begin update patients set first_name='Denied' where id='60000000-0000-0000-0000-000000000001';raise exception 'FAIL info edit';exception when insufficient_privilege then null;end;
 begin update patients set date_of_birth='1990-01-01' where id='60000000-0000-0000-0000-000000000001';raise exception 'FAIL date edit';exception when insufficient_privilege then null;end;
 delete from financial_transactions where id='70000000-0000-0000-0000-000000000001';get diagnostics n=row_count;if n<>0 then raise exception 'Finance viewer deleted entry';end if;
 delete from patient_imaging where id='80000000-0000-0000-0000-000000000001';get diagnostics n=row_count;if n<>0 then raise exception 'Denied photo deletion succeeded';end if;
 delete from storage.objects where bucket_id='patient-imaging';get diagnostics n=row_count;if n<>0 then raise exception 'Denied storage deletion succeeded';end if;
end;$$;
insert into staff_leave_requests(id,clinic_id,practitioner_id,staff_name,start_date,end_date,leave_kind,start_time,end_time) values('90000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Dr Test','2030-01-08','2030-01-08','half_day','10:00','14:00');
do $$declare n int;begin update staff_leave_requests set status='approved' where id='90000000-0000-0000-0000-000000000001';get diagnostics n=row_count;if n<>0 then raise exception 'Staff self-approved leave';end if;end;$$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
update staff_leave_requests set status='approved' where id='90000000-0000-0000-0000-000000000001';
do $$begin
 begin insert into appointments(organization_id,clinic_id,patient_id,clinician_name,scheduled_at) values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Dr Test','2030-01-08 05:30:00+00');raise exception 'FAIL leave booking accepted';exception when raise_exception then if sqlerrm='FAIL leave booking accepted' then raise;end if;end;
end;$$;
insert into appointments(organization_id,clinic_id,patient_id,clinician_name,scheduled_at) values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Dr Test','2030-01-08 08:30:00+00');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
do $$begin
 if exists(select 1 from patients where id='60000000-0000-0000-0000-000000000001') then raise exception 'Cross clinic patient leak';end if;
 begin perform set_clinic_member_access('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','{"patients.update":true}');raise exception 'FAIL cross clinic admin grant';exception when insufficient_privilege then null;end;
end;$$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
-- Catalog pricing and estimates: server checks cannot be bypassed by editing the request body.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
insert into treatment_categories(id,organization_id,clinic_id,name) values('a0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','QA category');
insert into treatment_catalogue(id,organization_id,clinic_id,category_id,name,standard_price) values('a0000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','QA treatment',1000);
update treatment_catalogue set standard_price=1200 where id='a0000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
insert into patient_treatment_plans(id,organization_id,clinic_id,patient_id) values('a0000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001');
insert into patient_treatment_items(id,organization_id,clinic_id,patient_id,treatment_plan_id,treatment_catalogue_id,treatment_name_snapshot,unit_price_snapshot,quantity,final_price) values('a0000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000002','QA treatment',1200,2,1);
do $$declare n int;begin
 if (select final_price from patient_treatment_items where id='a0000000-0000-0000-0000-000000000004')<>2400 then raise exception 'Client bypassed server total calculation';end if;
 begin update patient_treatment_items set unit_price_snapshot=200 where id='a0000000-0000-0000-0000-000000000004';raise exception 'FAIL custom price accepted';exception when insufficient_privilege then null;end;
 begin update patient_treatment_items set discount_percent=50 where id='a0000000-0000-0000-0000-000000000004';raise exception 'FAIL discount accepted';exception when insufficient_privilege then null;end;
 begin update patient_treatment_plans set additional_adjustment=-100 where id='a0000000-0000-0000-0000-000000000003';raise exception 'FAIL adjustment accepted';exception when insufficient_privilege then null;end;
 update treatment_catalogue set standard_price=1 where id='a0000000-0000-0000-0000-000000000002';get diagnostics n=row_count;if n<>0 then raise exception 'Doctor changed catalogue price';end if;
 delete from patient_treatment_items where id='a0000000-0000-0000-0000-000000000004';get diagnostics n=row_count;if n<>0 then raise exception 'Doctor removed treatment without permission';end if;
end;$$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_clinic_member_access('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','{"patient_price.override":true,"treatment_discount.apply":true,"pricing.manage":true,"imaging.delete":true,"finance.manage":true}');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
update patient_treatment_items set unit_price_snapshot=1000,discount_percent=10,discount_amount=200 where id='a0000000-0000-0000-0000-000000000004';
update patient_treatment_plans set additional_adjustment=-100 where id='a0000000-0000-0000-0000-000000000003';
update treatment_catalogue set standard_price=1300 where id='a0000000-0000-0000-0000-000000000002';
do $$declare n int;begin
 if (select final_price from patient_treatment_items where id='a0000000-0000-0000-0000-000000000004')<>1800 then raise exception 'Granted price calculation wrong';end if;
 delete from storage.objects where name='30000000-0000-0000-0000-000000000001/test.jpg';get diagnostics n=row_count;if n<>1 then raise exception 'Allowed file deletion blocked';end if;
 delete from patient_imaging where id='80000000-0000-0000-0000-000000000001';get diagnostics n=row_count;if n<>1 then raise exception 'Allowed photo deletion blocked';end if;
 delete from financial_transactions where id='70000000-0000-0000-0000-000000000001';get diagnostics n=row_count;if n<>1 then raise exception 'Allowed finance delete blocked';end if;
end;$$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_clinic_member_access('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','{"patients.view":false}');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
do $$begin if exists(select 1 from patient_treatment_items where id='a0000000-0000-0000-0000-000000000004') then raise exception 'Denied patient access leaked treatment plan';end if;end;$$;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_clinic_member_status('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002',false);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
do $$begin if has_clinic_permission('30000000-0000-0000-0000-000000000001','clinical.write') or is_clinic_member('30000000-0000-0000-0000-000000000001') then raise exception 'Suspended member still has access';end if;end;$$;
rollback;

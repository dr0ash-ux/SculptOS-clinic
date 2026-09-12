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
do $$begin if has_clinic_permission('30000000-0000-0000-0000-000000000001','pharmacy.view') is not true then raise exception 'Admin missing pharmacy';end if;end $$;
select set_clinic_member_access('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','{"pharmacy.view":true,"pharmacy.manage":true,"prescriptions.write":true}');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
insert into clinic_medicines(id,clinic_id,name,strength,form,category,route,instructions) values('d0000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','QA medicine','500 mg','Tablet','Other','Oral','After food');
insert into patient_prescriptions(id,clinic_id,patient_id,prescriber_name,items,created_by) values('e0000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Dr Test','[{"medicine_key":"custom:d0000000-0000-0000-0000-000000000001","name":"QA medicine","strength":"500 mg","form":"Tablet","route":"Oral","dose":"1 tablet (500 mg)","frequency":"Three times daily","duration":"5 days","instructions":"After food"}]','10000000-0000-0000-0000-000000000003');
do $$begin
 if (select created_by from patient_prescriptions where id='e0000000-0000-0000-0000-000000000001')<>auth.uid() then raise exception 'Prescriber identity spoofed';end if;
 if (select count(*) from dental_medicine_references)<>8 then raise exception 'Missing reference data';end if;
 begin update patient_prescriptions set prescriber_name='Changed';raise exception 'FAIL immutable prescription updated';exception when insufficient_privilege then null;end;
 begin insert into clinic_medicines(clinic_id,name,strength,form,route) values('30000000-0000-0000-0000-000000000002','Leak','5 mg','Tablet','Oral');raise exception 'FAIL cross branch medicine insert';exception when insufficient_privilege then null;end;
 begin insert into patient_prescriptions(clinic_id,patient_id,prescriber_name,items,created_by) values('30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Dr Test','[{"medicine_key":"ref:paracetamol-500","name":"Paracetamol","strength":"500 mg","form":"Tablet","route":"Oral","dose":"","frequency":"","duration":"","instructions":""}]',auth.uid());raise exception 'FAIL incomplete prescription';exception when raise_exception then if sqlerrm='FAIL incomplete prescription' then raise;end if;end;
end $$;
update clinic_medicines set name='Updated medicine',active=false where id='d0000000-0000-0000-0000-000000000001';
do $$begin
 if (select items->0->>'name' from patient_prescriptions where id='e0000000-0000-0000-0000-000000000001')<>'QA medicine' then raise exception 'Historical prescription changed with catalogue';end if;
 begin insert into patient_prescriptions(clinic_id,patient_id,prescriber_name,items,created_by) select clinic_id,patient_id,prescriber_name,items,created_by from patient_prescriptions where id='e0000000-0000-0000-0000-000000000001';raise exception 'FAIL archived medicine prescribed';exception when raise_exception then if sqlerrm='FAIL archived medicine prescribed' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
do $$begin if exists(select 1 from clinic_medicines) or exists(select 1 from patient_prescriptions) then raise exception 'Other branch sees prescription data';end if;end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_clinic_member_access('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','{"pharmacy.manage":false,"prescriptions.write":false}');
insert into financial_transactions(clinic_id,type,category,amount,counterparty,reference_number,expense_period,patient_id) values('30000000-0000-0000-0000-000000000001','income','Treatment',500,'QA payer','QA receipt','2030-01-01','60000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
do $$begin
 begin insert into clinic_medicines(clinic_id,name,strength,form,route) values('30000000-0000-0000-0000-000000000001','Denied','5 mg','Tablet','Oral');raise exception 'FAIL denied medicine add';exception when insufficient_privilege then null;end;
 begin insert into patient_prescriptions(clinic_id,patient_id,prescriber_name,items,created_by) values('30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Dr Test','[{"medicine_key":"ref:paracetamol-500","name":"Paracetamol","strength":"500 mg","form":"Tablet","route":"Oral","dose":"500 mg","frequency":"Twice daily","duration":"2 days","instructions":"Do not exceed prescribed dose"}]',auth.uid());raise exception 'FAIL denied prescribing';exception when insufficient_privilege then null;end;
end $$;
rollback;

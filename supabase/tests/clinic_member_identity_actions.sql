-- Synthetic fixture only. Run in a disposable migrated database; rolls back all records.
begin;
insert into auth.users(id,email,email_confirmed_at) values('10000000-0000-0000-0000-000000000001','admin@example.test',now()),('10000000-0000-0000-0000-000000000002','doctor@example.test',now()),('10000000-0000-0000-0000-000000000003','outside@example.test',now()),('10000000-0000-0000-0000-000000000004','new@example.test',now());
insert into organizations(id,name,slug) values('20000000-0000-0000-0000-000000000001','Test','test-admin-controls');
insert into clinics(id,organization_id,name) values('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Test clinic'),('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Other clinic');
insert into memberships(id,organization_id,clinic_id,user_id,role) values('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','admin'),('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','doctor'),('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','admin');
insert into clinic_practitioners(id,organization_id,clinic_id,full_name,membership_id) values('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Dr Test','40000000-0000-0000-0000-000000000002');
insert into patients(id,organization_id,clinic_id,first_name,patient_number) values('60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Synthetic','QA-1');

insert into profiles(id,full_name) values('10000000-0000-0000-0000-000000000002','Wrong account name') on conflict(id) do update set full_name=excluded.full_name;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $$begin
 if not exists(select 1 from jsonb_array_elements(clinic_admin_team('30000000-0000-0000-0000-000000000001')) m where m->>'full_name'='Dr Test') then raise exception 'Clinic name was overridden by account profile';end if;
end;$$;
select edit_clinic_member('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','Dr Nisha','doctor');
do $$begin
 if not exists(select 1 from clinic_practitioners where id='50000000-0000-0000-0000-000000000001' and full_name='Dr Nisha') then raise exception 'Edited name not saved';end if;
 begin perform remove_clinic_member('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001');raise exception 'FAIL admin removal';exception when raise_exception then if sqlerrm='FAIL admin removal' then raise;end if;end;
 begin perform edit_clinic_member('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','Dr Nisha','admin');raise exception 'FAIL admin escalation';exception when raise_exception then if sqlerrm='FAIL admin escalation' then raise;end if;end;
end;$$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
do $$begin
 begin perform remove_clinic_member('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002');raise exception 'FAIL cross clinic removal';exception when insufficient_privilege then null;end;
 begin perform edit_clinic_member('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','Wrong','doctor');raise exception 'FAIL cross clinic edit';exception when insufficient_privilege then null;end;
end;$$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select remove_clinic_member('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002');
do $$begin
 if exists(select 1 from memberships where id='40000000-0000-0000-0000-000000000002') then raise exception 'Membership remains';end if;
 if not exists(select 1 from clinic_practitioners where id='50000000-0000-0000-0000-000000000001' and not active and membership_id is null) then raise exception 'Historical roster not retained inactive';end if;
end;$$;
select add_clinic_member('30000000-0000-0000-0000-000000000001','doctor@example.test','Dr Nisha','doctor','#123456');
do $$begin
 if not exists(select 1 from clinic_practitioners where full_name='Dr Nisha' and active and membership_id is not null) then raise exception 'Readding member did not reactivate roster';end if;
end;$$;
rollback;

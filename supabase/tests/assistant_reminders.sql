begin;
insert into auth.users(id,email) values ('a1000000-0000-0000-0000-000000000001','one@test.invalid'),('a1000000-0000-0000-0000-000000000002','two@test.invalid'),('a1000000-0000-0000-0000-000000000003','three@test.invalid');
insert into organizations(id,name,slug) values('a2000000-0000-0000-0000-000000000001','Milo test','milo-test');
insert into clinics(id,organization_id,name) values('a3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','One'),('a3000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','Two');
insert into memberships(organization_id,clinic_id,user_id,role) values('a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','admin'),('a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','doctor'),('a2000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003','admin');
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
insert into assistant_reminders(id,clinic_id,title,due_at) values('a4000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001','Review stock',now()+interval '3 days');
do $$ begin
 if (select count(*) from assistant_reminders)<>1 then raise exception 'Own reminder not visible';end if;
 begin update assistant_reminders set user_id='a1000000-0000-0000-0000-000000000002';raise exception 'FAIL reassignment allowed';exception when insufficient_privilege then null;end;
 begin update assistant_reminders set clinic_id='a3000000-0000-0000-0000-000000000002';raise exception 'FAIL cross clinic move';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000002',true);
do $$ begin
 if exists(select 1 from assistant_reminders) then raise exception 'Same clinic colleague saw private reminder';end if;
 update assistant_reminders set title='Changed';if found then raise exception 'Other user updated reminder';end if;
 delete from assistant_reminders;if found then raise exception 'Other user deleted reminder';end if;
 begin insert into assistant_reminders(clinic_id,user_id,title,due_at) values('a3000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Impersonated',now());raise exception 'FAIL spoofed user';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000003',true);
do $$ begin
 if exists(select 1 from assistant_reminders) then raise exception 'Cross clinic reminder leak';end if;
 if exists(select 1 from assistant_low_stock('a3000000-0000-0000-0000-000000000001')) then raise exception 'Cross clinic stock leak';end if;
 begin insert into assistant_reminders(clinic_id,title,due_at) values('a3000000-0000-0000-0000-000000000001','Wrong clinic',now());raise exception 'FAIL cross clinic insert';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true);
update assistant_reminders set completed_at=now();
do $$begin if not exists(select 1 from assistant_reminders where completed_at is not null) then raise exception 'Completion not saved';end if;end$$;
reset role;
-- Revoke the doctor's membership and verify their own reminder becomes inaccessible.
insert into assistant_reminders(clinic_id,user_id,title,due_at) values('a3000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','Doctor private reminder',now());
update memberships set active=false where user_id='a1000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000002',true);
do $$begin if exists(select 1 from assistant_reminders) then raise exception 'Suspended member retains access';end if;end$$;
set local role anon;
do $$begin begin perform * from assistant_reminders;raise exception 'FAIL anonymous access';exception when insufficient_privilege then null;end;end$$;
rollback;

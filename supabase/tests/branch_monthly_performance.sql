-- Synthetic fixture only. Run in a disposable migrated database; rolls back all records.
begin;
insert into auth.users(id,email,email_confirmed_at) values('10000000-0000-0000-0000-000000000001','admin@example.test',now()),('10000000-0000-0000-0000-000000000002','doctor@example.test',now()),('10000000-0000-0000-0000-000000000003','outside@example.test',now()),('10000000-0000-0000-0000-000000000004','new@example.test',now());
insert into organizations(id,name,slug) values('20000000-0000-0000-0000-000000000001','Test','test-admin-controls');
insert into clinics(id,organization_id,name) values('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Test clinic'),('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Other clinic');
insert into memberships(id,organization_id,clinic_id,user_id,role) values('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','admin'),('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','doctor'),('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','admin');
insert into clinic_practitioners(id,organization_id,clinic_id,full_name,membership_id) values('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Dr Test','40000000-0000-0000-0000-000000000002');
insert into patients(id,organization_id,clinic_id,first_name,patient_number) values('60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Synthetic','QA-1');
-- Undated legacy completion is deliberately inserted with the new trigger disabled, only in this rolled-back fixture.
alter table patient_treatment_items disable trigger stamp_treatment_completion;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
insert into patient_treatment_plans(id,organization_id,clinic_id,patient_id,created_at,additional_adjustment) values('a0000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','2030-01-15',-50);
insert into patient_treatment_items(id,organization_id,clinic_id,patient_id,treatment_plan_id,treatment_name_snapshot,quantity,unit_price_snapshot,discount_percent,discount_amount,final_price,status,created_at,completed_at) values
('a0000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003','QA',2,1000,10,200,1800,'Completed','2029-12-31 19:00:00+00','2030-01-31 18:29:00+00'),
('a0000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003','Undated',1,100,0,0,100,'Completed','2029-01-01',null);
alter table patient_treatment_items enable trigger stamp_treatment_completion;
insert into financial_transactions(clinic_id,type,category,amount,transaction_date) select '30000000-0000-0000-0000-000000000001','income','Consultation',100,'2030-01-15'::date from generate_series(1,101);
insert into financial_transactions(clinic_id,type,category,amount,transaction_date,status) values
('30000000-0000-0000-0000-000000000001','income','Boundary',10,'2030-01-01','recorded'),
('30000000-0000-0000-0000-000000000001','income','Boundary',20,'2030-01-31','recorded'),
('30000000-0000-0000-0000-000000000001','income','Before month',999,'2029-12-31','recorded'),
('30000000-0000-0000-0000-000000000001','income','After month',999,'2030-02-01','recorded'),
('30000000-0000-0000-0000-000000000001','income','Pending',999,'2030-01-15','pending'),
('30000000-0000-0000-0000-000000000001','expense','Void',999,'2030-01-15','void'),
('30000000-0000-0000-0000-000000000002','income','Other branch',88888,'2030-01-15','recorded'),
('30000000-0000-0000-0000-000000000001','expense','Marketing',300,'2030-01-15','recorded'),
('30000000-0000-0000-0000-000000000001','expense','Unknown historic category',200,'2030-01-15','recorded');
insert into inventory_items(id,clinic_id,name,category,unit) values('b0000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','QA item','Endodontics','piece');
insert into inventory_purchases(id,clinic_id,purchased_on,total_amount) values('b0000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','2030-01-15',500),('b0000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','2030-01-15',100);
insert into inventory_stock_movements(item_id,inventory_purchase_id,movement_type,quantity,unit_cost_snapshot,movement_date) values('b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002','purchase',2,200,'2030-01-15');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
do $$declare r jsonb; n numeric; stamp timestamptz;begin
 r:=clinic_monthly_performance('30000000-0000-0000-0000-000000000001','2030-01-20');
 if (r->>'income')::numeric<>10130 or (r->>'expense')::numeric<>1100 or (r->>'entries')::int<>107 then raise exception 'Full-month recorded cash totals incorrect: %',r;end if;
 if (r->>'treatments')::int<>1 or (r->>'treatment_units')::numeric<>2 or (r->>'discounts')::numeric<>250 or (r->>'undated_completions')::int<>1 or (r->>'pending_entries')::int<>1 then raise exception 'Clinical totals or timezone incorrect: %',r;end if;
 if jsonb_array_length(r->'daily')<>31 then raise exception 'Missing zero days';end if;
 select sum((v->>'income')::numeric) into n from jsonb_array_elements(r->'daily') v;if n<>10130 then raise exception 'Income series mismatch';end if;
 select sum((v->>'expense')::numeric) into n from jsonb_array_elements(r->'daily') v;if n<>1100 then raise exception 'Expense series mismatch';end if;
 select sum((v->>'amount')::numeric) into n from jsonb_array_elements(r->'expense_categories') v;if n<>1100 then raise exception 'Category mismatch';end if;
 select sum((v->>'amount')::numeric) into n from jsonb_array_elements(r->'inventory_categories') v;if n<>600 then raise exception 'Inventory duplicated or unallocated lost';end if;
 if not (r->'inventory_categories' @> '[{"category":"Endodontics","amount":500}]'::jsonb) then raise exception 'Inventory costs not allocated';end if;
 r:=clinic_monthly_performance('30000000-0000-0000-0000-000000000001','2032-02-01');
 if (r->>'income')::numeric<>0 or jsonb_array_length(r->'daily')<>29 or jsonb_array_length(r->'expense_categories')<>0 then raise exception 'Empty leap month incorrect';end if;
 begin perform clinic_monthly_performance('30000000-0000-0000-0000-000000000002','2030-01-01');raise exception 'FAIL branch leak';exception when insufficient_privilege then null;end;
 begin perform clinic_monthly_performance('30000000-0000-0000-0000-000000000001',null);raise exception 'FAIL invalid month';exception when invalid_parameter_value then null;end;
 update patient_treatment_items set status='Planned',completed_at='2030-01-01' where id='a0000000-0000-0000-0000-000000000004';
 if (select completed_at from patient_treatment_items where id='a0000000-0000-0000-0000-000000000004') is not null then raise exception 'Reopened completion remained';end if;
 update patient_treatment_items set status='Completed',completed_at='2030-01-01' where id='a0000000-0000-0000-0000-000000000004';
 select completed_at into stamp from patient_treatment_items where id='a0000000-0000-0000-0000-000000000004';
 if stamp<>now() then raise exception 'Completion timestamp spoofed';end if;
 update patient_treatment_items set completed_at='2030-01-01' where id='a0000000-0000-0000-0000-000000000004';
 if (select completed_at from patient_treatment_items where id='a0000000-0000-0000-0000-000000000004')<>stamp then raise exception 'Completion timestamp changed on edit';end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
do $$begin begin perform clinic_monthly_performance('30000000-0000-0000-0000-000000000001','2030-01-01');raise exception 'FAIL permission leak';exception when insufficient_privilege then null;end;end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_clinic_member_access('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','{"finance.view":true,"patients.view":false}');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
do $$begin if (clinic_monthly_performance('30000000-0000-0000-0000-000000000001','2030-01-01')->>'income')::numeric<>10130 then raise exception 'Finance-only viewer cannot report';end if;end $$;
rollback;

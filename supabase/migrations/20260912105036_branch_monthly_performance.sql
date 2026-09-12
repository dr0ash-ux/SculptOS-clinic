-- Monthly reports contain aggregates only; source records retain their existing RLS.
begin;
alter table public.financial_transactions add column reporting_category text
  check (reporting_category in ('inventory','marketing','payroll','rent_utilities','maintenance','other','treatment','consultation','other_income'));
alter table public.patient_treatment_items add column completed_at timestamptz;
-- Historical completion dates are unknown. Never infer them from creation dates.
create function public.stamp_treatment_completion() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.status = 'Completed' then
   if tg_op = 'INSERT' then new.completed_at := now();
   elsif old.status <> 'Completed' then new.completed_at := now();
   else new.completed_at := old.completed_at; end if;
 else new.completed_at := null; end if;
 return new;
end $$;
create trigger stamp_treatment_completion before insert or update on public.patient_treatment_items
 for each row execute function public.stamp_treatment_completion();
create index performance_transactions_month on public.financial_transactions(clinic_id,transaction_date) where status='recorded';
create index performance_treatments_completed on public.patient_treatment_items(clinic_id,completed_at) where status='Completed';
create index performance_treatments_created on public.patient_treatment_items(clinic_id,created_at);
create schema if not exists private;
revoke all on schema private from public,anon;
grant usage on schema private to authenticated;
-- Explicit finance permission allows aggregate reporting without exposing patient files.
create function private.clinic_monthly_performance(target_clinic uuid, report_month date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare start_day date; end_day date; zone text; start_ts timestamptz; end_ts timestamptz; result jsonb;
begin
 if auth.uid() is null or not public.has_clinic_permission(target_clinic,'finance.view') then
   raise exception 'You do not have access to this branch report.' using errcode='42501';
 end if;
 if report_month is null or report_month < date '2000-01-01' or report_month > date '2100-12-31' then
   raise exception 'Choose a valid reporting month.' using errcode='22023';
 end if;
 start_day := date_trunc('month',report_month)::date; end_day := (start_day + interval '1 month')::date;
 select timezone into zone from public.clinics where id=target_clinic;
 start_ts := start_day::timestamp at time zone zone; end_ts := end_day::timestamp at time zone zone;
 with tx as materialized (
   select f.*,case
    when f.type='income' then 'income'
    when f.inventory_purchase_id is not null then 'inventory'
    when f.reporting_category in ('inventory','marketing','payroll','rent_utilities','maintenance','other') then f.reporting_category
    when lower(f.category) ~ '(inventory|procurement|consumable)' then 'inventory'
    when lower(f.category) ~ '(marketing|advertis|promotion)' then 'marketing'
    when lower(f.category) ~ '(salary|payroll|consultant)' then 'payroll'
    when lower(f.category) ~ '(rent|utilities|electricity|water|internet)' then 'rent_utilities'
    when lower(f.category) ~ '(maintenance|repair)' then 'maintenance'
    else 'other' end as bucket
   from public.financial_transactions f where f.clinic_id=target_clinic and f.status='recorded'
    and f.transaction_date>=start_day and f.transaction_date<end_day
 ), completed as materialized (
   select (t.completed_at at time zone zone)::date as day,t.quantity
   from public.patient_treatment_items t where t.clinic_id=target_clinic and t.status='Completed'
    and t.completed_at>=start_ts and t.completed_at<end_ts
 ), discounts as materialized (
   -- Current saved discounts on this month's active estimates. Not cash deductions.
   select (t.created_at at time zone zone)::date as day,t.discount_amount as amount
   from public.patient_treatment_items t join public.patient_treatment_plans p on p.id=t.treatment_plan_id and p.clinic_id=target_clinic
   where t.clinic_id=target_clinic and p.status='active' and t.status not in ('Cancelled','Deferred')
    and t.created_at>=start_ts and t.created_at<end_ts and t.discount_amount>0
   union all
   select (p.created_at at time zone zone)::date,greatest(0,-p.additional_adjustment)
   from public.patient_treatment_plans p where p.clinic_id=target_clinic and p.status='active'
    and p.created_at>=start_ts and p.created_at<end_ts and p.additional_adjustment<0
 ), daily as (
   select d::date as day,
    coalesce((select sum(amount) from tx where transaction_date=d::date and type='income'),0) as income,
    coalesce((select sum(amount) from tx where transaction_date=d::date and type='expense'),0) as expense,
    (select count(*) from completed where day=d::date) as treatments,
    coalesce((select sum(amount) from discounts where day=d::date),0) as discounts
   from generate_series(start_day::timestamp,(end_day-1)::timestamp,interval '1 day') d
 ), expense_categories as (
   select bucket as category,sum(amount) as amount from tx where type='expense' group by bucket
 ), inventory_allocations as (
   -- Allocate each purchase's single ledger charge across its item categories by cost.
   -- Missing item costs remain explicitly unallocated; purchases are never counted twice.
   select f.id,coalesce(nullif(trim(i.category),''),'Unallocated inventory') as category,
     sum(m.total_value) as weight
   from tx f join public.inventory_stock_movements m on m.inventory_purchase_id=f.inventory_purchase_id and m.movement_type='purchase'
   join public.inventory_items i on i.id=m.item_id and i.clinic_id=target_clinic
   join public.inventory_purchases p on p.id=m.inventory_purchase_id and p.clinic_id=target_clinic
   where f.type='expense' and f.bucket='inventory' group by f.id,coalesce(nullif(trim(i.category),''),'Unallocated inventory')
 ), inventory_parts as (
   select f.id,coalesce(a.category,nullif(trim(f.subcategory),''),'Unallocated inventory') as category,
    case when w.total>0 then f.amount*a.weight/w.total else f.amount end as amount
   from tx f left join (select id,sum(weight) total from inventory_allocations group by id) w on w.id=f.id
   left join inventory_allocations a on a.id=f.id and w.total>0
   where f.type='expense' and f.bucket='inventory'
 )
 select jsonb_build_object(
  'month',start_day,'timezone',zone,
  'income',coalesce((select sum(amount) from tx where type='income'),0),
  'expense',coalesce((select sum(amount) from tx where type='expense'),0),
  'treatments',(select count(*) from completed),
  'treatment_units',coalesce((select sum(quantity) from completed),0),
  'discounts',coalesce((select sum(amount) from discounts),0),
  'entries',(select count(*) from tx),
  'undated_completions',(select count(*) from public.patient_treatment_items where clinic_id=target_clinic and status='Completed' and completed_at is null),
  'pending_entries',(select count(*) from public.financial_transactions where clinic_id=target_clinic and status='pending' and transaction_date>=start_day and transaction_date<end_day),
  'daily',coalesce((select jsonb_agg(to_jsonb(daily) order by day) from daily),'[]'::jsonb),
  'expense_categories',coalesce((select jsonb_agg(to_jsonb(expense_categories) order by amount desc,category) from expense_categories),'[]'::jsonb),
  'inventory_categories',coalesce((select jsonb_agg(jsonb_build_object('category',category,'amount',amount) order by amount desc,category) from (select category,sum(amount) amount from inventory_parts group by category) x),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function private.clinic_monthly_performance(uuid,date) from public,anon;
grant execute on function private.clinic_monthly_performance(uuid,date) to authenticated;
create function public.clinic_monthly_performance(target_clinic uuid,report_month date)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.clinic_monthly_performance(target_clinic,report_month);
$$;
revoke all on function public.clinic_monthly_performance(uuid,date) from public,anon;
grant execute on function public.clinic_monthly_performance(uuid,date) to authenticated;
comment on function public.clinic_monthly_performance(uuid,date) is 'Branch monthly cash movement, completion counts and current saved estimate discounts. Recorded entries only; never price-list data. Discounts are not subtracted from cash income. Historical undated completions are disclosed separately.';
commit;

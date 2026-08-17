-- Finance, inventory and treatment-pricing extension.  All tables remain clinic scoped.

alter type public.app_role add value if not exists 'manager';

-- Explicit per-staff exceptions reuse the role_permissions vocabulary.  An admin is
-- the only actor permitted to administer these exceptions (enforced below).
create table public.membership_permission_overrides (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  permission text not null check (permission in ('finance.view', 'finance.manage', 'inventory.view', 'inventory.manage')),
  effect text not null check (effect in ('allow', 'deny')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (membership_id, permission)
);

insert into public.role_permissions(role, permission) values
  ('admin', 'finance.view'), ('admin', 'finance.manage'), ('admin', 'inventory.view'), ('admin', 'inventory.manage'), ('admin', 'finance.access.manage'),
  ('manager', 'finance.view'), ('manager', 'finance.manage'), ('manager', 'inventory.view'), ('manager', 'inventory.manage')
on conflict do nothing;

create or replace function public.has_clinic_permission(target_clinic uuid, required_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.clinic_id = target_clinic and m.user_id = auth.uid() and m.active
      and coalesce((select mpo.effect = 'allow' from public.membership_permission_overrides mpo
                    where mpo.membership_id = m.id and mpo.permission = required_permission),
                   exists (select 1 from public.role_permissions rp where rp.role = m.role and rp.permission = required_permission))
      and not exists (select 1 from public.membership_permission_overrides mpo
                      where mpo.membership_id = m.id and mpo.permission = required_permission and mpo.effect = 'deny')
  );
$$;


create table public.finance_categories (
  id uuid primary key default gen_random_uuid(), clinic_id uuid references public.clinics(id) on delete cascade,
  type text not null check (type in ('income','expense')), name text not null, active boolean not null default true,
  unique nulls not distinct (clinic_id, type, name)
);
create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete restrict,
  branch_id uuid references public.clinics(id) on delete restrict, transaction_date date not null default current_date,
  type text not null check (type in ('income','expense')), category text not null, subcategory text,
  amount numeric(12,2) not null check (amount > 0), payment_method text check (payment_method in ('cash','card','upi','bank_transfer','other')),
  status text not null default 'recorded' check (status in ('recorded','pending','void')),
  note text, patient_id uuid references public.patients(id) on delete restrict,
  treatment_plan_item_id uuid references public.patient_treatment_items(id) on delete restrict,
  inventory_purchase_id uuid, staff_id uuid references auth.users(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now(),
  voided_at timestamptz, voided_by uuid references auth.users(id) on delete restrict
);
create table public.staff_compensation (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete restrict, kind text not null check (kind in ('salary','consultant_payment')),
  due_date date not null, paid_date date, amount numeric(12,2) not null check (amount > 0), notes text,
  financial_transaction_id uuid unique references public.financial_transactions(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null, category text not null, brand text, sku text, unit text not null default 'piece',
  reorder_threshold numeric(12,3) not null default 0 check (reorder_threshold >= 0),
  current_stock numeric(12,3) not null default 0 check (current_stock >= 0), active boolean not null default true,
  default_unit_cost numeric(12,2) not null default 0 check (default_unit_cost >= 0), supplier text,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (clinic_id, name)
);
create table public.inventory_purchases (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade,
  supplier text, purchased_on date not null default current_date, total_amount numeric(12,2) not null check (total_amount >= 0),
  finance_transaction_id uuid unique references public.financial_transactions(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
alter table public.financial_transactions add constraint financial_transactions_inventory_purchase_fk foreign key (inventory_purchase_id) references public.inventory_purchases(id) on delete restrict;
create table public.inventory_stock_movements (
  id uuid primary key default gen_random_uuid(), item_id uuid not null references public.inventory_items(id) on delete restrict,
  inventory_purchase_id uuid references public.inventory_purchases(id) on delete set null,
  movement_type text not null check (movement_type in ('purchase','usage','wastage','adjustment','return')),
  quantity numeric(12,3) not null check (quantity <> 0), unit_cost_snapshot numeric(12,2) not null default 0 check (unit_cost_snapshot >= 0),
  total_value numeric(12,2) generated always as (abs(quantity) * unit_cost_snapshot) stored, movement_date date not null default current_date,
  reason text, patient_id uuid references public.patients(id) on delete restrict, treatment_plan_item_id uuid references public.patient_treatment_items(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);

create index financial_transactions_clinic_date_idx on public.financial_transactions(clinic_id, transaction_date desc);
create index financial_transactions_plan_item_idx on public.financial_transactions(treatment_plan_item_id) where treatment_plan_item_id is not null;
create index inventory_items_clinic_active_idx on public.inventory_items(clinic_id, active);
create index inventory_movements_item_date_idx on public.inventory_stock_movements(item_id, movement_date desc);

create or replace function public.apply_inventory_movement() returns trigger language plpgsql set search_path = public as $$
declare next_stock numeric(12,3); signed_quantity numeric(12,3);
begin
  signed_quantity := case when new.movement_type in ('usage','wastage','return') then -abs(new.quantity) else new.quantity end;
  select current_stock + signed_quantity into next_stock from public.inventory_items where id = new.item_id for update;
  if next_stock is null or next_stock < 0 then raise exception 'Stock movement would make inventory negative'; end if;
  new.quantity := signed_quantity;
  update public.inventory_items set current_stock = next_stock, updated_at = now() where id = new.item_id;
  return new;
end; $$;
create trigger inventory_movement_updates_stock before insert on public.inventory_stock_movements for each row execute procedure public.apply_inventory_movement();

create or replace view public.monthly_finance_summary with (security_invoker = true) as
select clinic_id, date_trunc('month', transaction_date)::date as month,
 coalesce(sum(amount) filter (where type='income' and status='recorded'),0) as total_income,
 coalesce(sum(amount) filter (where type='expense' and status='recorded'),0) as total_expenditure,
 coalesce(sum(amount) filter (where type='income' and status='recorded'),0)-coalesce(sum(amount) filter (where type='expense' and status='recorded'),0) as net_profit
from public.financial_transactions group by clinic_id, date_trunc('month', transaction_date);

alter table public.membership_permission_overrides enable row level security;
alter table public.finance_categories enable row level security; alter table public.financial_transactions enable row level security; alter table public.staff_compensation enable row level security;
alter table public.inventory_items enable row level security; alter table public.inventory_purchases enable row level security; alter table public.inventory_stock_movements enable row level security;
create policy "admins manage finance inventory staff access" on public.membership_permission_overrides for all to authenticated using (exists(select 1 from public.memberships m where m.id=membership_id and public.has_clinic_permission(m.clinic_id,'finance.access.manage'))) with check (exists(select 1 from public.memberships m where m.id=membership_id and public.has_clinic_permission(m.clinic_id,'finance.access.manage')));
create policy "finance users view categories" on public.finance_categories for select to authenticated using (clinic_id is null or public.has_clinic_permission(clinic_id,'finance.view'));
create policy "finance managers manage categories" on public.finance_categories for all to authenticated using (clinic_id is not null and public.has_clinic_permission(clinic_id,'finance.manage')) with check (clinic_id is not null and public.has_clinic_permission(clinic_id,'finance.manage'));
create policy "finance users manage transactions" on public.financial_transactions for all to authenticated using (public.has_clinic_permission(clinic_id,'finance.view')) with check (public.has_clinic_permission(clinic_id,'finance.manage'));
create policy "finance users manage compensation" on public.staff_compensation for all to authenticated using (public.has_clinic_permission(clinic_id,'finance.view')) with check (public.has_clinic_permission(clinic_id,'finance.manage'));
create policy "inventory users manage items" on public.inventory_items for all to authenticated using (public.has_clinic_permission(clinic_id,'inventory.view')) with check (public.has_clinic_permission(clinic_id,'inventory.manage'));
create policy "inventory users manage purchases" on public.inventory_purchases for all to authenticated using (public.has_clinic_permission(clinic_id,'inventory.view')) with check (public.has_clinic_permission(clinic_id,'inventory.manage'));
create policy "inventory users manage movements" on public.inventory_stock_movements for all to authenticated using (exists(select 1 from public.inventory_items i where i.id=item_id and public.has_clinic_permission(i.clinic_id,'inventory.view'))) with check (exists(select 1 from public.inventory_items i where i.id=item_id and public.has_clinic_permission(i.clinic_id,'inventory.manage')));

insert into public.finance_categories (clinic_id,type,name) values
 (null,'income','consultation'),(null,'income','treatment payment'),(null,'income','imaging'),(null,'income','lab/other'),
 (null,'expense','inventory/procurement'),(null,'expense','salary'),(null,'expense','consultant payment'),(null,'expense','lab charges'),(null,'expense','rent'),(null,'expense','utilities'),(null,'expense','marketing'),(null,'expense','maintenance'),(null,'expense','software'),(null,'expense','miscellaneous') on conflict do nothing;
insert into public.inventory_items(clinic_id,name,category,unit) select c.id, s.name,s.category,s.unit from public.clinics c cross join (values
 ('Anesthetic cartridges','Anaesthetic','cartridge'),('Needles','Consumables','piece'),('Gloves','PPE','box'),('Masks','PPE','box'),('Cotton rolls','Consumables','box'),('Gauze','Consumables','pack'),('Suction tips','Consumables','piece'),('Composite','Restorative','syringe'),('Bonding agent','Restorative','bottle'),('Etchant','Restorative','syringe'),('GIC','Restorative','capsule'),('Matrix bands','Restorative','box'),('Burs','Endodontics','piece'),('Files','Endodontics','box'),('Gutta-percha','Endodontics','box'),('Sealers','Endodontics','syringe'),('Irrigants','Endodontics','bottle'),('Rubber dam supplies','Endodontics','box'),('Alginate','Impression','pack'),('PVS','Impression','cartridge'),('Impression trays','Impression','piece'),('Temporary materials','Prosthodontics','pack'),('Cement','Prosthodontics','pack'),('Sutures','Surgical','pack'),('Surgical blades','Surgical','box'),('Saline','Surgical','vial'),('Sterile drapes','Surgical','pack'),('Implants and components','Implants','piece'),('Orthodontic brackets','Orthodontics','kit'),('Orthodontic wires','Orthodontics','pack'),('Elastics','Orthodontics','pack'),('Bands and ligatures','Orthodontics','pack'),('Sterilization pouches','Sterilization','box'),('Disinfectants','Sterilization','bottle'),('Handpieces and consumables','Equipment','piece')
 ) as s(name,category,unit) on conflict do nothing;

-- An inventory purchase has exactly one corresponding cash expense; wastage only
-- changes stock and never creates a second expense.
create or replace function public.link_inventory_purchase_finance() returns trigger language plpgsql security definer set search_path = public as $$
declare tx_id uuid;
begin
  if new.total_amount > 0 and new.finance_transaction_id is null then
    insert into public.financial_transactions(clinic_id, transaction_date, type, category, amount, payment_method, note, inventory_purchase_id, created_by, updated_by)
    values(new.clinic_id, new.purchased_on, 'expense', 'inventory/procurement', new.total_amount, 'other', coalesce(new.supplier,'Inventory purchase'), new.id, new.created_by, new.created_by)
    returning id into tx_id;
    update public.inventory_purchases set finance_transaction_id=tx_id where id=new.id;
  end if;
  return new;
end; $$;
create trigger inventory_purchase_creates_finance after insert on public.inventory_purchases for each row execute procedure public.link_inventory_purchase_finance();
create or replace function public.audit_finance_or_stock_change() returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid; action_name text; before_row jsonb;
begin
  cid := case when tg_table_name='financial_transactions' then new.clinic_id else (select clinic_id from public.inventory_items where id=new.item_id) end;
  action_name := case when tg_table_name='financial_transactions' then 'finance.transaction.updated' else 'inventory.stock.adjusted' end;
  before_row := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  insert into public.audit_log(clinic_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(cid,auth.uid(),action_name,tg_table_name,new.id,jsonb_build_object('old',before_row,'new',to_jsonb(new)));
  return new;
end; $$;
create trigger financial_transaction_audit after update on public.financial_transactions for each row execute procedure public.audit_finance_or_stock_change();
create trigger inventory_adjustment_audit after insert on public.inventory_stock_movements for each row when (new.movement_type='adjustment') execute procedure public.audit_finance_or_stock_change();

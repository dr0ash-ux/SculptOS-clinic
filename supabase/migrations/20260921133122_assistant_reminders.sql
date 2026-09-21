create table public.assistant_reminders (
 id uuid primary key default gen_random_uuid(),
 clinic_id uuid not null references public.clinics(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 1 and 240),
 due_at timestamptz not null,
 completed_at timestamptz,
 created_at timestamptz not null default now()
);
create index assistant_reminders_due_idx on public.assistant_reminders(clinic_id,user_id,due_at) where completed_at is null;
alter table public.assistant_reminders enable row level security;
revoke all on public.assistant_reminders from public,anon,authenticated;
grant select,insert,update,delete on public.assistant_reminders to authenticated;
create policy "Members read own reminders" on public.assistant_reminders for select to authenticated using(user_id=(select auth.uid()) and public.is_clinic_member(clinic_id));
create policy "Members create own reminders" on public.assistant_reminders for insert to authenticated with check(user_id=(select auth.uid()) and public.is_clinic_member(clinic_id));
create policy "Members update own reminders" on public.assistant_reminders for update to authenticated using(user_id=(select auth.uid()) and public.is_clinic_member(clinic_id)) with check(user_id=(select auth.uid()) and public.is_clinic_member(clinic_id));
create policy "Members delete own reminders" on public.assistant_reminders for delete to authenticated using(user_id=(select auth.uid()) and public.is_clinic_member(clinic_id));

-- Invoker rights preserve the inventory table's existing RLS and permission checks.
create function public.assistant_low_stock(target_clinic uuid)
returns table(name text,current_stock numeric,reorder_threshold numeric,unit text)
language sql stable security invoker set search_path=public as $$
 select i.name,i.current_stock::numeric,i.reorder_threshold::numeric,i.unit
 from public.inventory_items i where i.clinic_id=target_clinic and i.active
 and public.has_clinic_permission(target_clinic,'inventory.view')
 and i.current_stock<=i.reorder_threshold order by i.name,i.id limit 30
$$;
revoke all on function public.assistant_low_stock(uuid) from public,anon;
grant execute on function public.assistant_low_stock(uuid) to authenticated;

-- Non-destructive inventory metadata extension. Existing stock and movements are preserved.
alter table public.inventory_items add column if not exists batch_number text;
alter table public.inventory_items add column if not exists expiry_date date;
alter table public.inventory_items add column if not exists storage_notes text;
alter table public.inventory_items add column if not exists description text;
alter table public.inventory_items add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- Reception can record receipts and clinical stock movements; RLS remains clinic-scoped.
insert into public.role_permissions(role, permission) values
  ('receptionist', 'inventory.view'),
  ('receptionist', 'inventory.manage')
on conflict do nothing;

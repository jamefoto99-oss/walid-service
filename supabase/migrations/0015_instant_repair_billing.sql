alter table public.receipts
  alter column invoice_id drop not null,
  add column if not exists vehicle_id uuid references public.vehicles(id),
  add column if not exists repair_job_id uuid references public.repair_jobs(id),
  add column if not exists subtotal numeric(12,2),
  add column if not exists discount numeric(12,2),
  add column if not exists total numeric(12,2);

create index if not exists receipts_vehicle_idx
on public.receipts (vehicle_id);

create index if not exists receipts_repair_job_idx
on public.receipts (repair_job_id);

create index if not exists receipts_direct_reference_idx
on public.receipts (invoice_id, repair_job_id, received_at desc);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  item_type text not null check (item_type in ('labor','part','other')),
  part_id uuid references public.parts(id),
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'รายการ',
  unit_price numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists receipt_items_receipt_idx
on public.receipt_items (receipt_id, sort_order);

alter table public.receipt_items enable row level security;

drop policy if exists receipt_items_finance on public.receipt_items;
create policy receipt_items_finance on public.receipt_items
for all to authenticated
using (public.has_role(array['owner','manager','accountant']))
with check (public.has_role(array['owner','manager','accountant']));

alter table public.company_settings
  add column if not exists cash_bill_prefix text not null default 'CB',
  add column if not exists bank_name text,
  add column if not exists bank_logo_url text,
  add column if not exists bank_account_number text,
  add column if not exists bank_account_name text;

create table if not exists public.cash_bills (
  id uuid primary key default gen_random_uuid(),
  cash_bill_no text not null unique,
  issued_at date not null default current_date,
  customer_id uuid references public.customers(id),
  vehicle_id uuid references public.vehicles(id),
  repair_job_id uuid references public.repair_jobs(id),
  customer_name text,
  customer_phone text,
  customer_address text,
  vehicle_text text,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash','transfer','qr','other')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.cash_bill_items (
  id uuid primary key default gen_random_uuid(),
  cash_bill_id uuid not null references public.cash_bills(id) on delete cascade,
  item_type text not null check (item_type in ('labor','part','other')),
  part_id uuid references public.parts(id),
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'ชิ้น',
  unit_price numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

alter table public.income_records
  add column if not exists cash_bill_id uuid references public.cash_bills(id);

create index if not exists cash_bills_issued_at_idx on public.cash_bills (issued_at);
create index if not exists cash_bills_customer_idx on public.cash_bills (customer_id);
create index if not exists cash_bill_items_bill_idx on public.cash_bill_items (cash_bill_id);
create index if not exists income_records_cash_bill_idx on public.income_records (cash_bill_id);

drop trigger if exists touch_cash_bills on public.cash_bills;
create trigger touch_cash_bills
before update on public.cash_bills
for each row execute function public.touch_updated_at();

alter table public.cash_bills enable row level security;
alter table public.cash_bill_items enable row level security;

drop policy if exists cash_bills_finance on public.cash_bills;
create policy cash_bills_finance on public.cash_bills
for all to authenticated
using (public.has_role(array['owner','manager','accountant']))
with check (public.has_role(array['owner','manager','accountant']));

drop policy if exists cash_bill_items_finance on public.cash_bill_items;
create policy cash_bill_items_finance on public.cash_bill_items
for all to authenticated
using (public.has_role(array['owner','manager','accountant']))
with check (public.has_role(array['owner','manager','accountant']));

insert into public.document_counters(prefix, running_number)
values ('CB', 0)
on conflict (prefix) do nothing;

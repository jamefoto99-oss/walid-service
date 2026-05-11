create extension if not exists "pgcrypto";

create table public.roles (
  name text primary key,
  description text not null
);

insert into public.roles (name, description) values
  ('owner', 'Owner / Admin'),
  ('manager', 'Manager'),
  ('staff', 'Staff'),
  ('accountant', 'Accountant')
on conflict (name) do nothing;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role text not null default 'staff' references public.roles(name),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_settings (
  id uuid primary key default gen_random_uuid(),
  company_name text not null default 'อู่วาลิดการช่าง',
  logo_url text,
  address text,
  phone text,
  line_id text,
  document_footer text,
  quotation_prefix text not null default 'QT',
  invoice_prefix text not null default 'INV',
  receipt_prefix text not null default 'RC',
  repair_job_prefix text not null default 'JOB',
  cash_bill_prefix text not null default 'CB',
  bank_name text,
  bank_logo_url text,
  bank_account_number text,
  bank_account_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.document_counters (
  prefix text primary key,
  running_number integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.document_counters(prefix, running_number) values
  ('JOB', 0), ('QT', 0), ('INV', 0), ('RC', 0), ('CB', 0)
on conflict (prefix) do nothing;

create or replace function public.next_document_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_running integer;
begin
  insert into public.document_counters(prefix, running_number)
  values (p_prefix, 0)
  on conflict (prefix) do nothing;

  update public.document_counters
  set running_number = running_number + 1,
      updated_at = now()
  where prefix = p_prefix
  returning running_number into v_running;

  return p_prefix || to_char(now(), 'YYYYMM') || '-' || lpad(v_running::text, 5, '0');
end;
$$;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  address text,
  line_id text,
  notes text,
  outstanding_balance numeric(12,2) not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  license_plate text not null,
  province text,
  brand text not null,
  model text not null,
  year integer,
  color text,
  mileage integer not null default 0,
  vin text,
  engine_no text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.repair_jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  received_at date not null default current_date,
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid not null references public.vehicles(id),
  reported_problem text not null,
  preliminary_check text,
  intake_mileage integer,
  images text[] not null default '{}',
  valuables text,
  receiver_id uuid references public.profiles(id),
  status text not null default 'received' check (status in (
    'received','diagnosing','quoted','waiting_approval','in_progress','waiting_parts',
    'completed','waiting_payment','delivered','cancelled'
  )),
  internal_notes text,
  estimated_total numeric(12,2) not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.repair_job_items (
  id uuid primary key default gen_random_uuid(),
  repair_job_id uuid not null references public.repair_jobs(id) on delete cascade,
  title text not null,
  description text,
  labor_price numeric(12,2) not null default 0,
  quantity numeric(12,2) not null default 1,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) generated always as (greatest((labor_price * quantity) - discount, 0)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.part_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  regular_items text,
  credit_balance numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.parts (
  id uuid primary key default gen_random_uuid(),
  part_code text not null unique,
  name text not null,
  category_id uuid references public.part_categories(id),
  cost_price numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null default 0,
  quantity_on_hand numeric(12,2) not null default 0,
  unit text not null default 'ชิ้น',
  supplier_id uuid references public.suppliers(id),
  low_stock_threshold numeric(12,2) not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (quantity_on_hand >= 0)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts(id),
  movement_type text not null check (movement_type in ('purchase','use','adjustment','return')),
  quantity numeric(12,2) not null,
  unit_cost numeric(12,2) not null default 0,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  purchase_no text not null unique,
  purchased_at date not null default current_date,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid','cancelled')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  part_id uuid not null references public.parts(id),
  quantity numeric(12,2) not null,
  unit_cost numeric(12,2) not null,
  total numeric(12,2) generated always as (quantity * unit_cost) stored,
  created_at timestamptz not null default now()
);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_no text not null unique,
  issued_at date not null default current_date,
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid references public.vehicles(id),
  repair_job_id uuid references public.repair_jobs(id),
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  terms text,
  status text not null default 'draft' check (status in ('draft','sent','approved','rejected','cancelled')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  item_type text not null check (item_type in ('labor','part','other')),
  part_id uuid references public.parts(id),
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  quotation_id uuid references public.quotations(id),
  issued_at date not null default current_date,
  due_at date not null,
  customer_id uuid not null references public.customers(id),
  vehicle_id uuid references public.vehicles(id),
  repair_job_id uuid references public.repair_jobs(id),
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','partial','paid','overdue','cancelled')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  item_type text not null check (item_type in ('labor','part','other')),
  part_id uuid references public.parts(id),
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  received_at date not null default current_date,
  customer_id uuid not null references public.customers(id),
  invoice_id uuid not null references public.invoices(id),
  payment_method text not null check (payment_method in ('cash','transfer','qr','other')),
  amount numeric(12,2) not null check (amount > 0),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.cash_bills (
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

create table public.cash_bill_items (
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

create table public.income_records (
  id uuid primary key default gen_random_uuid(),
  recorded_at date not null default current_date,
  category text not null check (category in ('repair_service','parts_sale','other')),
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  payment_method text not null check (payment_method in ('cash','transfer','qr','other')),
  reference_no text,
  receipt_id uuid references public.receipts(id),
  cash_bill_id uuid references public.cash_bills(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.expense_records (
  id uuid primary key default gen_random_uuid(),
  recorded_at date not null default current_date,
  category text not null check (category in ('parts_purchase','labor','equipment','electricity','water','rent','travel','other')),
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  payment_method text not null check (payment_method in ('cash','transfer','qr','other')),
  supplier_id uuid references public.suppliers(id),
  receipt_image_url text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id),
  receipt_id uuid references public.receipts(id),
  paid_at date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','transfer','qr','other')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  table_name text not null,
  record_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users(id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email, updated_at = now();

  insert into public.profiles(id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'staff')
  )
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'users','profiles','company_settings','customers','vehicles','repair_jobs','repair_job_items',
    'part_categories','suppliers','parts','purchases','quotations','invoices','receipts','cash_bills',
    'income_records','expense_records'
  ] loop
    execute format('drop trigger if exists touch_%I on public.%I', tbl, tbl);
    execute format('create trigger touch_%I before update on public.%I for each row execute function public.touch_updated_at()', tbl, tbl);
  end loop;
end;
$$;

create index customers_search_idx on public.customers using gin (to_tsvector('simple', coalesce(full_name,'') || ' ' || coalesce(phone,'')));
create index vehicles_plate_idx on public.vehicles (license_plate);
create index repair_jobs_status_idx on public.repair_jobs (status);
create index repair_jobs_customer_idx on public.repair_jobs (customer_id);
create index parts_low_stock_idx on public.parts (quantity_on_hand, low_stock_threshold);
create index invoices_status_idx on public.invoices (payment_status, due_at);
create index cash_bills_issued_at_idx on public.cash_bills (issued_at);
create index cash_bills_customer_idx on public.cash_bills (customer_id);
create index income_date_idx on public.income_records (recorded_at);
create index expense_date_idx on public.expense_records (recorded_at);
create index activity_logs_record_idx on public.activity_logs (table_name, record_id);

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true
$$;

create or replace function public.has_role(allowed text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = any(allowed), false)
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_active = true)
$$;

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.company_settings enable row level security;
alter table public.document_counters enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.repair_jobs enable row level security;
alter table public.repair_job_items enable row level security;
alter table public.part_categories enable row level security;
alter table public.parts enable row level security;
alter table public.stock_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.receipts enable row level security;
alter table public.cash_bills enable row level security;
alter table public.cash_bill_items enable row level security;
alter table public.income_records enable row level security;
alter table public.expense_records enable row level security;
alter table public.payment_records enable row level security;
alter table public.activity_logs enable row level security;

create policy roles_read on public.roles for select to authenticated using (true);
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(array['owner','manager']));
create policy profiles_owner_write on public.profiles for all to authenticated using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));
create policy users_owner_read on public.users for select to authenticated using (id = auth.uid() or public.has_role(array['owner']));

create policy company_read on public.company_settings for select to authenticated using (public.is_active_user());
create policy company_owner_write on public.company_settings for all to authenticated using (public.has_role(array['owner'])) with check (public.has_role(array['owner']));
create policy counters_owner_read on public.document_counters for select to authenticated using (public.has_role(array['owner','manager','accountant']));

create policy customers_read on public.customers for select to authenticated using (public.is_active_user());
create policy customers_write on public.customers for insert to authenticated with check (public.has_role(array['owner','manager','staff','accountant']));
create policy customers_update on public.customers for update to authenticated using (public.has_role(array['owner','manager','staff','accountant'])) with check (public.has_role(array['owner','manager','staff','accountant']));

create policy vehicles_read on public.vehicles for select to authenticated using (public.is_active_user());
create policy vehicles_write on public.vehicles for insert to authenticated with check (public.has_role(array['owner','manager','staff']));
create policy vehicles_update on public.vehicles for update to authenticated using (public.has_role(array['owner','manager','staff'])) with check (public.has_role(array['owner','manager','staff']));

create policy repair_read on public.repair_jobs for select to authenticated using (public.is_active_user());
create policy repair_write on public.repair_jobs for insert to authenticated with check (public.has_role(array['owner','manager','staff']));
create policy repair_update on public.repair_jobs for update to authenticated using (public.has_role(array['owner','manager','staff'])) with check (public.has_role(array['owner','manager','staff']));
create policy repair_items_rw on public.repair_job_items for all to authenticated using (public.has_role(array['owner','manager','staff'])) with check (public.has_role(array['owner','manager','staff']));

create policy inventory_read on public.part_categories for select to authenticated using (public.is_active_user());
create policy inventory_categories_write on public.part_categories for all to authenticated using (public.has_role(array['owner','manager','accountant'])) with check (public.has_role(array['owner','manager','accountant']));
create policy parts_read on public.parts for select to authenticated using (public.is_active_user());
create policy parts_write on public.parts for all to authenticated using (public.has_role(array['owner','manager','accountant'])) with check (public.has_role(array['owner','manager','accountant']));
create policy stock_read on public.stock_movements for select to authenticated using (public.is_active_user());
create policy stock_write on public.stock_movements for insert to authenticated with check (public.has_role(array['owner','manager','accountant']));

create policy suppliers_finance on public.suppliers for all to authenticated using (public.has_role(array['owner','manager','accountant'])) with check (public.has_role(array['owner','manager','accountant']));
create policy purchases_finance on public.purchases for all to authenticated using (public.has_role(array['owner','manager','accountant'])) with check (public.has_role(array['owner','manager','accountant']));
create policy purchase_items_finance on public.purchase_items for all to authenticated using (public.has_role(array['owner','manager','accountant'])) with check (public.has_role(array['owner','manager','accountant']));

create policy quotations_finance on public.quotations for all to authenticated using (public.has_role(array['owner','manager','accountant'])) with check (public.has_role(array['owner','manager','accountant']));
create policy quotation_items_finance on public.quotation_items for all to authenticated using (public.has_role(array['owner','manager','accountant'])) with check (public.has_role(array['owner','manager','accountant']));
create policy invoices_finance on public.invoices for all to authenticated using (public.has_role(array['owner','manager','accountant'])) with check (public.has_role(array['owner','manager','accountant']));
create policy invoice_items_finance on public.invoice_items for all to authenticated using (public.has_role(array['owner','manager','accountant'])) with check (public.has_role(array['owner','manager','accountant']));
create policy receipts_finance on public.receipts for all to authenticated using (public.has_role(array['owner','manager','accountant'])) with check (public.has_role(array['owner','manager','accountant']));
create policy cash_bills_finance on public.cash_bills for all to authenticated using (public.has_role(array['owner','manager','accountant'])) with check (public.has_role(array['owner','manager','accountant']));
create policy cash_bill_items_finance on public.cash_bill_items for all to authenticated using (public.has_role(array['owner','manager','accountant'])) with check (public.has_role(array['owner','manager','accountant']));
create policy income_finance on public.income_records for all to authenticated using (public.has_role(array['owner','manager','accountant'])) with check (public.has_role(array['owner','manager','accountant']));
create policy expenses_finance on public.expense_records for all to authenticated using (public.has_role(array['owner','manager','accountant'])) with check (public.has_role(array['owner','manager','accountant']));
create policy payments_finance on public.payment_records for all to authenticated using (public.has_role(array['owner','manager','accountant'])) with check (public.has_role(array['owner','manager','accountant']));

create policy activity_read on public.activity_logs for select to authenticated using (public.has_role(array['owner','manager','accountant']));
create policy activity_insert on public.activity_logs for insert to authenticated with check (public.is_active_user());

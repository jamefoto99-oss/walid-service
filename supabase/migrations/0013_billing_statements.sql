alter table public.company_settings
  add column if not exists billing_statement_prefix text not null default 'BL';

create table if not exists public.billing_statements (
  id uuid primary key default gen_random_uuid(),
  billing_statement_no text not null unique,
  issued_at date not null default current_date,
  due_at date,
  customer_id uuid not null references public.customers(id),
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status text not null default 'issued' check (status in ('draft','issued','paid','cancelled')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.billing_statement_items (
  id uuid primary key default gen_random_uuid(),
  billing_statement_id uuid not null references public.billing_statements(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id),
  invoice_no text not null,
  issued_at date,
  due_at date,
  total numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  unique (billing_statement_id, invoice_id)
);

create index if not exists billing_statements_customer_idx
  on public.billing_statements (customer_id, issued_at desc)
  where deleted_at is null;

create index if not exists billing_statements_status_idx
  on public.billing_statements (status, due_at)
  where deleted_at is null;

create index if not exists billing_statement_items_statement_idx
  on public.billing_statement_items (billing_statement_id, sort_order);

create index if not exists billing_statement_items_invoice_idx
  on public.billing_statement_items (invoice_id);

drop trigger if exists touch_billing_statements_updated_at on public.billing_statements;
create trigger touch_billing_statements_updated_at
before update on public.billing_statements
for each row execute function public.touch_updated_at();

alter table public.billing_statements enable row level security;
alter table public.billing_statement_items enable row level security;

drop policy if exists billing_statements_finance on public.billing_statements;
create policy billing_statements_finance on public.billing_statements
for all to authenticated
using (public.has_role(array['owner','manager','accountant']))
with check (public.has_role(array['owner','manager','accountant']));

drop policy if exists billing_statement_items_finance on public.billing_statement_items;
create policy billing_statement_items_finance on public.billing_statement_items
for all to authenticated
using (public.has_role(array['owner','manager','accountant']))
with check (public.has_role(array['owner','manager','accountant']));

insert into public.document_counters (prefix, running_number)
values ('BL', 0)
on conflict (prefix) do nothing;

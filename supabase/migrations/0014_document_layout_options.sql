alter table public.quotations
  add column if not exists show_payment_info boolean not null default false,
  add column if not exists show_paid_stamp boolean not null default false;

alter table public.invoices
  add column if not exists show_payment_info boolean not null default false,
  add column if not exists show_paid_stamp boolean not null default false;

alter table public.receipts
  add column if not exists show_payment_info boolean not null default false,
  add column if not exists show_paid_stamp boolean not null default false;

alter table public.cash_bills
  add column if not exists show_payment_info boolean not null default false,
  add column if not exists show_paid_stamp boolean not null default false;

alter table public.billing_statements
  add column if not exists show_payment_info boolean not null default false,
  add column if not exists show_paid_stamp boolean not null default false;

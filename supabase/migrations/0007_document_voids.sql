alter table public.invoices
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id),
  add column if not exists void_reason text;

alter table public.receipts
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id),
  add column if not exists void_reason text;

alter table public.purchases
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id),
  add column if not exists void_reason text;

alter table public.payment_records
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id),
  add column if not exists void_reason text;

alter table public.income_records
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id),
  add column if not exists void_reason text;

alter table public.expense_records
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id),
  add column if not exists void_reason text;

create index if not exists invoices_voided_idx
on public.invoices (voided_at, payment_status, issued_at desc);

create index if not exists receipts_voided_idx
on public.receipts (voided_at, received_at desc);

create index if not exists purchases_voided_idx
on public.purchases (voided_at, payment_status, purchased_at desc);

create index if not exists payment_records_voided_idx
on public.payment_records (voided_at, invoice_id, receipt_id);

create index if not exists income_records_voided_idx
on public.income_records (voided_at, recorded_at desc);

create index if not exists expense_records_voided_idx
on public.expense_records (voided_at, recorded_at desc);

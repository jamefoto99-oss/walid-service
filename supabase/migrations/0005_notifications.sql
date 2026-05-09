create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'part_low_stock',
    'part_out_of_stock',
    'invoice_due_soon',
    'invoice_overdue',
    'job_waiting_parts',
    'job_waiting_payment'
  )),
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  source_table text not null,
  source_id uuid not null,
  source_key text not null unique,
  title text not null,
  message text not null,
  target_href text not null,
  target_roles text[] not null default array['owner','manager','staff','accountant']::text[],
  due_at date,
  metadata jsonb not null default '{}',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, profile_id)
);

drop trigger if exists touch_notifications on public.notifications;
create trigger touch_notifications
before update on public.notifications
for each row execute function public.touch_updated_at();

create index if not exists notifications_unresolved_idx
on public.notifications (resolved_at, severity, updated_at desc);

create index if not exists notifications_source_idx
on public.notifications (source_table, source_id);

create index if not exists notifications_target_roles_idx
on public.notifications using gin (target_roles);

create index if not exists notification_reads_profile_idx
on public.notification_reads (profile_id, read_at desc);

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;

drop policy if exists notifications_read on public.notifications;
create policy notifications_read
on public.notifications
for select
to authenticated
using (
  public.is_active_user()
  and public.current_role() = any(target_roles)
);

drop policy if exists notification_reads_select_own on public.notification_reads;
create policy notification_reads_select_own
on public.notification_reads
for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists notification_reads_insert_own on public.notification_reads;
create policy notification_reads_insert_own
on public.notification_reads
for insert
to authenticated
with check (profile_id = auth.uid());

drop policy if exists notification_reads_update_own on public.notification_reads;
create policy notification_reads_update_own
on public.notification_reads
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create or replace function public.refresh_system_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_count integer := 0;
begin
  if not public.is_active_user() then
    raise exception 'permission denied';
  end if;

  create temporary table if not exists active_system_notifications (
    source_key text primary key,
    type text not null,
    severity text not null,
    source_table text not null,
    source_id uuid not null,
    title text not null,
    message text not null,
    target_href text not null,
    target_roles text[] not null,
    due_at date,
    metadata jsonb not null
  ) on commit drop;

  truncate table active_system_notifications;

  insert into active_system_notifications (
    source_key,
    type,
    severity,
    source_table,
    source_id,
    title,
    message,
    target_href,
    target_roles,
    due_at,
    metadata
  )
  select
    'part_stock:' || p.id::text,
    case when p.quantity_on_hand <= 0 then 'part_out_of_stock' else 'part_low_stock' end,
    case when p.quantity_on_hand <= 0 then 'critical' else 'warning' end,
    'parts',
    p.id,
    case when p.quantity_on_hand <= 0 then 'อะไหล่หมดสต๊อก' else 'อะไหล่ใกล้หมด' end,
    p.part_code || ' ' || p.name || ' เหลือ ' || p.quantity_on_hand::text || ' ' || p.unit || ' จุดเตือน ' || p.low_stock_threshold::text,
    '/parts',
    array['owner','manager','staff','accountant']::text[],
    null::date,
    jsonb_build_object(
      'part_code', p.part_code,
      'part_name', p.name,
      'quantity_on_hand', p.quantity_on_hand,
      'low_stock_threshold', p.low_stock_threshold,
      'unit', p.unit
    )
  from public.parts p
  where p.deleted_at is null
    and p.quantity_on_hand <= p.low_stock_threshold

  union all

  select
    'invoice_overdue:' || i.id::text,
    'invoice_overdue',
    'critical',
    'invoices',
    i.id,
    'ใบแจ้งหนี้เกินกำหนด',
    i.invoice_no || ' ค้างชำระ ' || i.balance_due::text || ' บาท ครบกำหนด ' || i.due_at::text,
    '/invoices/' || i.id::text,
    array['owner','manager','accountant']::text[],
    i.due_at,
    jsonb_build_object(
      'invoice_no', i.invoice_no,
      'balance_due', i.balance_due,
      'payment_status', i.payment_status,
      'due_at', i.due_at
    )
  from public.invoices i
  where i.deleted_at is null
    and i.payment_status in ('unpaid','partial','overdue')
    and i.balance_due > 0
    and i.due_at < current_date

  union all

  select
    'invoice_due_soon:' || i.id::text,
    'invoice_due_soon',
    'warning',
    'invoices',
    i.id,
    'ใบแจ้งหนี้ใกล้ครบกำหนด',
    i.invoice_no || ' ค้างชำระ ' || i.balance_due::text || ' บาท ครบกำหนด ' || i.due_at::text,
    '/invoices/' || i.id::text,
    array['owner','manager','accountant']::text[],
    i.due_at,
    jsonb_build_object(
      'invoice_no', i.invoice_no,
      'balance_due', i.balance_due,
      'payment_status', i.payment_status,
      'due_at', i.due_at
    )
  from public.invoices i
  where i.deleted_at is null
    and i.payment_status in ('unpaid','partial')
    and i.balance_due > 0
    and i.due_at between current_date and current_date + 3

  union all

  select
    'job_waiting_parts:' || r.id::text,
    'job_waiting_parts',
    'warning',
    'repair_jobs',
    r.id,
    'งานซ่อมรออะไหล่นาน',
    r.job_number || ' รออะไหล่มากกว่า 2 วัน',
    '/repair-jobs/' || r.id::text,
    array['owner','manager','staff']::text[],
    null::date,
    jsonb_build_object(
      'job_number', r.job_number,
      'status', r.status,
      'updated_at', r.updated_at
    )
  from public.repair_jobs r
  where r.deleted_at is null
    and r.status = 'waiting_parts'
    and r.updated_at < now() - interval '2 days'

  union all

  select
    'job_waiting_payment:' || r.id::text,
    'job_waiting_payment',
    'warning',
    'repair_jobs',
    r.id,
    'งานซ่อมรอชำระเงิน',
    r.job_number || ' รอชำระเงินมากกว่า 1 วัน',
    '/repair-jobs/' || r.id::text,
    array['owner','manager','accountant']::text[],
    null::date,
    jsonb_build_object(
      'job_number', r.job_number,
      'status', r.status,
      'updated_at', r.updated_at
    )
  from public.repair_jobs r
  where r.deleted_at is null
    and r.status = 'waiting_payment'
    and r.updated_at < now() - interval '1 day';

  insert into public.notifications (
    source_key,
    type,
    severity,
    source_table,
    source_id,
    title,
    message,
    target_href,
    target_roles,
    due_at,
    metadata,
    resolved_at
  )
  select
    source_key,
    type,
    severity,
    source_table,
    source_id,
    title,
    message,
    target_href,
    target_roles,
    due_at,
    metadata,
    null
  from active_system_notifications
  on conflict (source_key)
  do update set
    type = excluded.type,
    severity = excluded.severity,
    title = excluded.title,
    message = excluded.message,
    target_href = excluded.target_href,
    target_roles = excluded.target_roles,
    due_at = excluded.due_at,
    metadata = excluded.metadata,
    resolved_at = null,
    updated_at = now();

  update public.notifications n
  set resolved_at = now(),
      updated_at = now()
  where n.resolved_at is null
    and n.type in (
      'part_low_stock',
      'part_out_of_stock',
      'invoice_due_soon',
      'invoice_overdue',
      'job_waiting_parts',
      'job_waiting_payment'
    )
    and not exists (
      select 1
      from active_system_notifications a
      where a.source_key = n.source_key
    );

  select count(*)
  into v_active_count
  from public.notifications n
  where n.resolved_at is null;

  return v_active_count;
end;
$$;

grant execute on function public.refresh_system_notifications() to authenticated;

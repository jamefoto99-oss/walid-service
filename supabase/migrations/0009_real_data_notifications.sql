create index if not exists notifications_type_resolved_idx
on public.notifications (type, resolved_at, updated_at desc);

create index if not exists notification_reads_notification_idx
on public.notification_reads (notification_id);

create or replace function public.refresh_system_notifications()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
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

  with part_alerts as (
    select
      p.*,
      pc.name as category_name,
      s.name as supplier_name
    from public.parts p
    left join public.part_categories pc on pc.id = p.category_id
    left join public.suppliers s on s.id = p.supplier_id and s.deleted_at is null
    where p.deleted_at is null
      and coalesce(p.quantity_on_hand, 0) <= coalesce(p.low_stock_threshold, 0)
  ),
  invoice_overdue_alerts as (
    select
      i.*,
      c.full_name as customer_name,
      v.license_plate,
      v.province,
      greatest((current_date - i.due_at), 0) as days_overdue
    from public.invoices i
    left join public.customers c on c.id = i.customer_id
    left join public.vehicles v on v.id = i.vehicle_id
    where i.deleted_at is null
      and i.voided_at is null
      and i.payment_status in ('unpaid','partial','overdue')
      and coalesce(i.balance_due, 0) > 0
      and i.due_at < current_date
  ),
  invoice_due_soon_alerts as (
    select
      i.*,
      c.full_name as customer_name,
      v.license_plate,
      v.province,
      greatest((i.due_at - current_date), 0) as days_until_due
    from public.invoices i
    left join public.customers c on c.id = i.customer_id
    left join public.vehicles v on v.id = i.vehicle_id
    where i.deleted_at is null
      and i.voided_at is null
      and i.payment_status in ('unpaid','partial')
      and coalesce(i.balance_due, 0) > 0
      and i.due_at between current_date and current_date + 3
  ),
  waiting_parts_jobs as (
    select
      r.*,
      c.full_name as customer_name,
      v.license_plate,
      v.province,
      greatest(floor(extract(epoch from (now() - r.updated_at)) / 86400)::integer, 0) as waiting_days
    from public.repair_jobs r
    left join public.customers c on c.id = r.customer_id
    left join public.vehicles v on v.id = r.vehicle_id
    where r.deleted_at is null
      and r.status = 'waiting_parts'
      and r.updated_at <= now() - interval '2 days'
  ),
  waiting_payment_jobs as (
    select
      r.*,
      c.full_name as customer_name,
      v.license_plate,
      v.province,
      greatest(floor(extract(epoch from (now() - r.updated_at)) / 86400)::integer, 0) as waiting_days
    from public.repair_jobs r
    left join public.customers c on c.id = r.customer_id
    left join public.vehicles v on v.id = r.vehicle_id
    where r.deleted_at is null
      and r.status = 'waiting_payment'
      and r.updated_at <= now() - interval '1 day'
  )
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
    case when coalesce(p.quantity_on_hand, 0) <= 0 then 'part_out_of_stock' else 'part_low_stock' end,
    case when coalesce(p.quantity_on_hand, 0) <= 0 then 'critical' else 'warning' end,
    'parts',
    p.id,
    case when coalesce(p.quantity_on_hand, 0) <= 0 then 'อะไหล่หมดสต๊อก' else 'อะไหล่ใกล้หมด' end,
    concat(
      p.part_code, ' ', p.name,
      ' เหลือ ', p.quantity_on_hand::text, ' ', p.unit,
      ' จุดเตือน ', p.low_stock_threshold::text,
      case when p.supplier_name is not null then ' | Supplier: ' || p.supplier_name else '' end
    ),
    '/parts/' || p.id::text,
    array['owner','manager','staff','accountant']::text[],
    null::date,
    jsonb_strip_nulls(jsonb_build_object(
      'part_code', p.part_code,
      'part_name', p.name,
      'category_name', p.category_name,
      'supplier_name', p.supplier_name,
      'quantity_on_hand', p.quantity_on_hand,
      'low_stock_threshold', p.low_stock_threshold,
      'unit', p.unit
    ))
  from part_alerts p

  union all

  select
    'invoice_overdue:' || i.id::text,
    'invoice_overdue',
    'critical',
    'invoices',
    i.id,
    'ใบแจ้งหนี้เกินกำหนด',
    concat(
      i.invoice_no,
      ' ', coalesce(i.customer_name, 'ไม่ระบุลูกค้า'),
      ' ค้างชำระ ', i.balance_due::text, ' บาท',
      ' เกินกำหนด ', i.days_overdue::text, ' วัน'
    ),
    '/invoices/' || i.id::text,
    array['owner','manager','accountant']::text[],
    i.due_at,
    jsonb_strip_nulls(jsonb_build_object(
      'invoice_no', i.invoice_no,
      'customer_name', i.customer_name,
      'license_plate', i.license_plate,
      'province', i.province,
      'balance_due', i.balance_due,
      'payment_status', i.payment_status,
      'due_at', i.due_at,
      'days_overdue', i.days_overdue
    ))
  from invoice_overdue_alerts i

  union all

  select
    'invoice_due_soon:' || i.id::text,
    'invoice_due_soon',
    'warning',
    'invoices',
    i.id,
    'ใบแจ้งหนี้ใกล้ครบกำหนด',
    concat(
      i.invoice_no,
      ' ', coalesce(i.customer_name, 'ไม่ระบุลูกค้า'),
      ' ค้างชำระ ', i.balance_due::text, ' บาท ',
      case
        when i.days_until_due = 0 then 'ครบกำหนดวันนี้'
        else 'ครบกำหนดใน ' || i.days_until_due::text || ' วัน'
      end
    ),
    '/invoices/' || i.id::text,
    array['owner','manager','accountant']::text[],
    i.due_at,
    jsonb_strip_nulls(jsonb_build_object(
      'invoice_no', i.invoice_no,
      'customer_name', i.customer_name,
      'license_plate', i.license_plate,
      'province', i.province,
      'balance_due', i.balance_due,
      'payment_status', i.payment_status,
      'due_at', i.due_at,
      'days_until_due', i.days_until_due
    ))
  from invoice_due_soon_alerts i

  union all

  select
    'job_waiting_parts:' || r.id::text,
    'job_waiting_parts',
    'warning',
    'repair_jobs',
    r.id,
    'งานซ่อมรออะไหล่นาน',
    concat(
      r.job_number,
      ' ', coalesce(r.customer_name, 'ไม่ระบุลูกค้า'),
      case when r.license_plate is not null then ' ทะเบียน ' || r.license_plate else '' end,
      ' รออะไหล่มา ', r.waiting_days::text, ' วัน'
    ),
    '/repair-jobs/' || r.id::text,
    array['owner','manager','staff']::text[],
    null::date,
    jsonb_strip_nulls(jsonb_build_object(
      'job_number', r.job_number,
      'customer_name', r.customer_name,
      'license_plate', r.license_plate,
      'province', r.province,
      'status', r.status,
      'reported_problem', r.reported_problem,
      'waiting_days', r.waiting_days,
      'last_updated_at', r.updated_at
    ))
  from waiting_parts_jobs r

  union all

  select
    'job_waiting_payment:' || r.id::text,
    'job_waiting_payment',
    'warning',
    'repair_jobs',
    r.id,
    'งานซ่อมรอชำระเงิน',
    concat(
      r.job_number,
      ' ', coalesce(r.customer_name, 'ไม่ระบุลูกค้า'),
      case when r.license_plate is not null then ' ทะเบียน ' || r.license_plate else '' end,
      ' รอชำระเงินมา ', r.waiting_days::text, ' วัน'
    ),
    '/repair-jobs/' || r.id::text,
    array['owner','manager','accountant']::text[],
    null::date,
    jsonb_strip_nulls(jsonb_build_object(
      'job_number', r.job_number,
      'customer_name', r.customer_name,
      'license_plate', r.license_plate,
      'province', r.province,
      'status', r.status,
      'reported_problem', r.reported_problem,
      'waiting_days', r.waiting_days,
      'last_updated_at', r.updated_at
    ))
  from waiting_payment_jobs r;

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
    source_table = excluded.source_table,
    source_id = excluded.source_id,
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

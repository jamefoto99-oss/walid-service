do $$
declare
  v_actor uuid;
  v_active_count integer;
begin
  select id
  into v_actor
  from public.profiles
  where is_active = true
    and role in ('owner','manager','accountant','staff')
  order by case role when 'owner' then 1 when 'manager' then 2 when 'accountant' then 3 else 4 end
  limit 1;

  if v_actor is null then
    raise exception 'No active profile exists for notification verification';
  end if;

  perform set_config('request.jwt.claim.sub', v_actor::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);

  select public.refresh_system_notifications()
  into v_active_count;

  if exists (
    select 1
    from public.parts p
    where p.deleted_at is null
      and coalesce(p.quantity_on_hand, 0) <= coalesce(p.low_stock_threshold, 0)
      and not exists (
        select 1
        from public.notifications n
        where n.source_key = 'part_stock:' || p.id::text
          and n.source_table = 'parts'
          and n.source_id = p.id
          and n.type in ('part_low_stock','part_out_of_stock')
          and n.resolved_at is null
      )
  ) then
    raise exception 'Missing active part stock notification';
  end if;

  if exists (
    select 1
    from public.invoices i
    where i.deleted_at is null
      and i.voided_at is null
      and i.payment_status in ('unpaid','partial','overdue')
      and coalesce(i.balance_due, 0) > 0
      and i.due_at < current_date
      and not exists (
        select 1
        from public.notifications n
        where n.source_key = 'invoice_overdue:' || i.id::text
          and n.source_table = 'invoices'
          and n.source_id = i.id
          and n.type = 'invoice_overdue'
          and n.resolved_at is null
      )
  ) then
    raise exception 'Missing active overdue invoice notification';
  end if;

  if exists (
    select 1
    from public.invoices i
    where i.deleted_at is null
      and i.voided_at is null
      and i.payment_status in ('unpaid','partial')
      and coalesce(i.balance_due, 0) > 0
      and i.due_at between current_date and current_date + 3
      and not exists (
        select 1
        from public.notifications n
        where n.source_key = 'invoice_due_soon:' || i.id::text
          and n.source_table = 'invoices'
          and n.source_id = i.id
          and n.type = 'invoice_due_soon'
          and n.resolved_at is null
      )
  ) then
    raise exception 'Missing active due-soon invoice notification';
  end if;

  if exists (
    select 1
    from public.repair_jobs r
    where r.deleted_at is null
      and r.status = 'waiting_parts'
      and r.updated_at <= now() - interval '2 days'
      and not exists (
        select 1
        from public.notifications n
        where n.source_key = 'job_waiting_parts:' || r.id::text
          and n.source_table = 'repair_jobs'
          and n.source_id = r.id
          and n.type = 'job_waiting_parts'
          and n.resolved_at is null
      )
  ) then
    raise exception 'Missing active waiting-parts job notification';
  end if;

  if exists (
    select 1
    from public.repair_jobs r
    where r.deleted_at is null
      and r.status = 'waiting_payment'
      and r.updated_at <= now() - interval '1 day'
      and not exists (
        select 1
        from public.notifications n
        where n.source_key = 'job_waiting_payment:' || r.id::text
          and n.source_table = 'repair_jobs'
          and n.source_id = r.id
          and n.type = 'job_waiting_payment'
          and n.resolved_at is null
      )
  ) then
    raise exception 'Missing active waiting-payment job notification';
  end if;

  if exists (
    select 1
    from public.notifications n
    where n.resolved_at is null
      and n.type in (
        'part_low_stock',
        'part_out_of_stock',
        'invoice_due_soon',
        'invoice_overdue',
        'job_waiting_parts',
        'job_waiting_payment'
      )
      and n.target_href !~* '^/(parts|invoices|repair-jobs)/[0-9a-f-]{36}$'
  ) then
    raise exception 'Notification target_href must deep-link to the source record';
  end if;

  raise notice 'Notification verification passed. Active notifications: %', v_active_count;
end $$;

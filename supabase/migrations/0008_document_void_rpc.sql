create or replace function public.document_invoice_status(
  p_total numeric,
  p_paid_amount numeric,
  p_due_at date
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_balance numeric := greatest(coalesce(p_total, 0) - coalesce(p_paid_amount, 0), 0);
begin
  if v_balance <= 0 then
    return 'paid';
  end if;

  if p_due_at is not null and p_due_at < current_date then
    return 'overdue';
  end if;

  if coalesce(p_paid_amount, 0) > 0 then
    return 'partial';
  end if;

  return 'unpaid';
end;
$$;

create or replace function public.void_receipt_transaction(
  p_receipt_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_receipt public.receipts%rowtype;
  v_invoice public.invoices%rowtype;
  v_reversed_amount numeric := 0;
  v_paid_amount numeric := 0;
  v_balance_due numeric := 0;
  v_payment_status text;
  v_payment_count integer := 0;
  v_income_count integer := 0;
begin
  if v_actor is null then
    raise exception 'กรุณาเข้าสู่ระบบก่อนยกเลิกใบเสร็จ';
  end if;

  if not public.has_role(array['owner','manager','accountant']) then
    raise exception 'ไม่มีสิทธิ์ยกเลิกใบเสร็จ';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'กรุณาระบุเหตุผลอย่างน้อย 8 ตัวอักษร';
  end if;

  select *
  into v_receipt
  from public.receipts
  where id = p_receipt_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'ไม่พบใบเสร็จ';
  end if;

  if v_receipt.voided_at is not null then
    raise exception 'ใบเสร็จนี้ถูกยกเลิกแล้ว';
  end if;

  select *
  into v_invoice
  from public.invoices
  where id = v_receipt.invoice_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'ไม่พบใบแจ้งหนี้อ้างอิง';
  end if;

  if v_invoice.voided_at is not null or v_invoice.payment_status = 'cancelled' then
    raise exception 'ใบแจ้งหนี้ถูกยกเลิกแล้ว ไม่สามารถยกเลิกใบเสร็จซ้ำได้';
  end if;

  select coalesce(sum(amount), 0), count(*)
  into v_reversed_amount, v_payment_count
  from public.payment_records
  where receipt_id = v_receipt.id
    and voided_at is null;

  if v_reversed_amount <= 0 then
    v_reversed_amount := v_receipt.amount;
  end if;

  update public.receipts
  set voided_at = v_now,
      voided_by = v_actor,
      void_reason = trim(p_reason),
      updated_at = v_now
  where id = v_receipt.id;

  update public.payment_records
  set voided_at = v_now,
      voided_by = v_actor,
      void_reason = trim(p_reason)
  where receipt_id = v_receipt.id
    and voided_at is null;

  get diagnostics v_payment_count = row_count;

  update public.income_records
  set deleted_at = v_now,
      voided_at = v_now,
      voided_by = v_actor,
      void_reason = trim(p_reason),
      updated_at = v_now
  where receipt_id = v_receipt.id
    and deleted_at is null
    and voided_at is null;

  get diagnostics v_income_count = row_count;

  v_paid_amount := greatest(coalesce(v_invoice.paid_amount, 0) - v_reversed_amount, 0);
  v_balance_due := greatest(coalesce(v_invoice.total, 0) - v_paid_amount, 0);
  v_payment_status := public.document_invoice_status(v_invoice.total, v_paid_amount, v_invoice.due_at);

  update public.invoices
  set paid_amount = v_paid_amount,
      balance_due = v_balance_due,
      payment_status = v_payment_status,
      updated_at = v_now
  where id = v_invoice.id;

  if v_invoice.repair_job_id is not null and v_payment_status <> 'paid' then
    update public.repair_jobs
    set status = 'waiting_payment',
        updated_at = v_now
    where id = v_invoice.repair_job_id;
  end if;

  insert into public.activity_logs (actor_id, action, table_name, record_id, metadata)
  values
    (
      v_actor,
      'void_receipt',
      'receipts',
      v_receipt.id,
      jsonb_build_object(
        'receipt_no', v_receipt.receipt_no,
        'invoice_id', v_invoice.id,
        'invoice_no', v_invoice.invoice_no,
        'reversed_amount', v_reversed_amount,
        'voided_payment_records', v_payment_count,
        'voided_income_records', v_income_count,
        'reason', trim(p_reason),
        'transactional', true
      )
    ),
    (
      v_actor,
      'reverse_invoice_payment',
      'invoices',
      v_invoice.id,
      jsonb_build_object(
        'receipt_id', v_receipt.id,
        'receipt_no', v_receipt.receipt_no,
        'paid_amount', v_paid_amount,
        'balance_due', v_balance_due,
        'payment_status', v_payment_status,
        'transactional', true
      )
    );

  return jsonb_build_object(
    'receipt_id', v_receipt.id,
    'receipt_no', v_receipt.receipt_no,
    'invoice_id', v_invoice.id,
    'invoice_no', v_invoice.invoice_no,
    'repair_job_id', v_invoice.repair_job_id,
    'message', format('ยกเลิกใบเสร็จ %s และคืนยอดใบแจ้งหนี้แล้ว', v_receipt.receipt_no)
  );
end;
$$;

create or replace function public.void_invoice_transaction(
  p_invoice_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_invoice public.invoices%rowtype;
  v_item record;
  v_active_receipts integer := 0;
  v_reversed_items integer := 0;
begin
  if v_actor is null then
    raise exception 'กรุณาเข้าสู่ระบบก่อนยกเลิกใบแจ้งหนี้';
  end if;

  if not public.has_role(array['owner','manager','accountant']) then
    raise exception 'ไม่มีสิทธิ์ยกเลิกใบแจ้งหนี้';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'กรุณาระบุเหตุผลอย่างน้อย 8 ตัวอักษร';
  end if;

  select *
  into v_invoice
  from public.invoices
  where id = p_invoice_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'ไม่พบใบแจ้งหนี้';
  end if;

  if v_invoice.voided_at is not null or v_invoice.payment_status = 'cancelled' then
    raise exception 'ใบแจ้งหนี้นี้ถูกยกเลิกแล้ว';
  end if;

  select count(*)
  into v_active_receipts
  from public.receipts
  where invoice_id = v_invoice.id
    and deleted_at is null
    and voided_at is null;

  if v_active_receipts > 0 then
    raise exception 'ใบแจ้งหนี้นี้มีใบเสร็จที่ยังไม่ถูกยกเลิก กรุณายกเลิกใบเสร็จก่อน';
  end if;

  for v_item in
    select
      ii.id,
      ii.part_id,
      ii.description,
      ii.quantity,
      ii.unit_price,
      p.deleted_at as part_deleted_at
    from public.invoice_items ii
    join public.parts p on p.id = ii.part_id
    where ii.invoice_id = v_invoice.id
      and ii.item_type = 'part'
      and ii.part_id is not null
    for update of p
  loop
    if v_item.part_deleted_at is not null then
      raise exception 'ไม่พบอะไหล่ %', v_item.description;
    end if;

    update public.parts
    set quantity_on_hand = quantity_on_hand + coalesce(v_item.quantity, 0),
        updated_at = v_now
    where id = v_item.part_id;

    insert into public.stock_movements (
      part_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by
    ) values (
      v_item.part_id,
      'return',
      coalesce(v_item.quantity, 0),
      coalesce(v_item.unit_price, 0),
      'invoice_void',
      v_invoice.id,
      format('คืนสต๊อกจากการยกเลิกใบแจ้งหนี้ %s: %s', v_invoice.invoice_no, trim(p_reason)),
      v_actor
    );

    v_reversed_items := v_reversed_items + 1;
  end loop;

  update public.invoices
  set payment_status = 'cancelled',
      paid_amount = 0,
      balance_due = 0,
      voided_at = v_now,
      voided_by = v_actor,
      void_reason = trim(p_reason),
      updated_at = v_now
  where id = v_invoice.id;

  if v_invoice.repair_job_id is not null then
    update public.repair_jobs
    set status = 'in_progress',
        updated_at = v_now
    where id = v_invoice.repair_job_id;
  end if;

  insert into public.activity_logs (actor_id, action, table_name, record_id, metadata)
  values (
    v_actor,
    'void_invoice',
    'invoices',
    v_invoice.id,
    jsonb_build_object(
      'invoice_no', v_invoice.invoice_no,
      'reversed_stock_items', v_reversed_items,
      'reason', trim(p_reason),
      'transactional', true
    )
  );

  return jsonb_build_object(
    'invoice_id', v_invoice.id,
    'invoice_no', v_invoice.invoice_no,
    'repair_job_id', v_invoice.repair_job_id,
    'reversed_stock_items', v_reversed_items,
    'message', format('ยกเลิกใบแจ้งหนี้ %s และคืนสต๊อกแล้ว', v_invoice.invoice_no)
  );
end;
$$;

create or replace function public.void_purchase_transaction(
  p_purchase_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_purchase public.purchases%rowtype;
  v_supplier_credit numeric := 0;
  v_item record;
  v_reversed_items integer := 0;
  v_voided_expenses integer := 0;
begin
  if v_actor is null then
    raise exception 'กรุณาเข้าสู่ระบบก่อนยกเลิกใบซื้อ';
  end if;

  if not public.has_role(array['owner','manager','accountant']) then
    raise exception 'ไม่มีสิทธิ์ยกเลิกใบซื้อ';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'กรุณาระบุเหตุผลอย่างน้อย 8 ตัวอักษร';
  end if;

  select *
  into v_purchase
  from public.purchases
  where id = p_purchase_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'ไม่พบใบซื้อ';
  end if;

  if v_purchase.voided_at is not null or v_purchase.payment_status = 'cancelled' then
    raise exception 'ใบซื้อนี้ถูกยกเลิกแล้ว';
  end if;

  if not exists (select 1 from public.purchase_items where purchase_id = v_purchase.id) then
    raise exception 'ใบซื้อนี้ไม่มีรายการอะไหล่';
  end if;

  for v_item in
    select
      pi.id,
      pi.part_id,
      pi.quantity,
      pi.unit_cost,
      p.name as part_name,
      p.quantity_on_hand
    from public.purchase_items pi
    join public.parts p on p.id = pi.part_id
    where pi.purchase_id = v_purchase.id
    for update of p
  loop
    if coalesce(v_item.quantity_on_hand, 0) < coalesce(v_item.quantity, 0) then
      raise exception 'สต๊อก % ไม่พอสำหรับกลับรายการใบซื้อ', coalesce(v_item.part_name, v_item.part_id::text);
    end if;
  end loop;

  for v_item in
    select
      pi.id,
      pi.part_id,
      pi.quantity,
      pi.unit_cost,
      p.quantity_on_hand
    from public.purchase_items pi
    join public.parts p on p.id = pi.part_id
    where pi.purchase_id = v_purchase.id
    for update of p
  loop
    update public.parts
    set quantity_on_hand = greatest(quantity_on_hand - coalesce(v_item.quantity, 0), 0),
        updated_at = v_now
    where id = v_item.part_id;

    insert into public.stock_movements (
      part_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by
    ) values (
      v_item.part_id,
      'return',
      -coalesce(v_item.quantity, 0),
      coalesce(v_item.unit_cost, 0),
      'purchase_void',
      v_purchase.id,
      format('กลับรายการใบซื้อ %s: %s', v_purchase.purchase_no, trim(p_reason)),
      v_actor
    );

    v_reversed_items := v_reversed_items + 1;
  end loop;

  select credit_balance
  into v_supplier_credit
  from public.suppliers
  where id = v_purchase.supplier_id
  for update;

  update public.purchases
  set payment_status = 'cancelled',
      paid_amount = 0,
      balance_due = 0,
      voided_at = v_now,
      voided_by = v_actor,
      void_reason = trim(p_reason),
      updated_at = v_now
  where id = v_purchase.id;

  update public.suppliers
  set credit_balance = greatest(coalesce(v_supplier_credit, 0) - greatest(coalesce(v_purchase.balance_due, 0), 0), 0),
      updated_at = v_now
  where id = v_purchase.supplier_id;

  update public.expense_records
  set deleted_at = v_now,
      voided_at = v_now,
      voided_by = v_actor,
      void_reason = trim(p_reason),
      updated_at = v_now
  where supplier_id = v_purchase.supplier_id
    and category = 'parts_purchase'
    and deleted_at is null
    and voided_at is null
    and description ilike '%' || v_purchase.purchase_no || '%';

  get diagnostics v_voided_expenses = row_count;

  insert into public.activity_logs (actor_id, action, table_name, record_id, metadata)
  values (
    v_actor,
    'void_purchase',
    'purchases',
    v_purchase.id,
    jsonb_build_object(
      'purchase_no', v_purchase.purchase_no,
      'reversed_stock_items', v_reversed_items,
      'voided_expense_records', v_voided_expenses,
      'reason', trim(p_reason),
      'transactional', true
    )
  );

  return jsonb_build_object(
    'purchase_id', v_purchase.id,
    'purchase_no', v_purchase.purchase_no,
    'supplier_id', v_purchase.supplier_id,
    'reversed_stock_items', v_reversed_items,
    'voided_expense_records', v_voided_expenses,
    'message', format('ยกเลิกใบซื้อ %s และกลับสต๊อกแล้ว', v_purchase.purchase_no)
  );
end;
$$;

revoke all on function public.void_receipt_transaction(uuid, text) from public;
revoke all on function public.void_invoice_transaction(uuid, text) from public;
revoke all on function public.void_purchase_transaction(uuid, text) from public;

grant execute on function public.void_receipt_transaction(uuid, text) to authenticated;
grant execute on function public.void_invoice_transaction(uuid, text) to authenticated;
grant execute on function public.void_purchase_transaction(uuid, text) to authenticated;

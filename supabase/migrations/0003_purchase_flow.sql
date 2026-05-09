insert into public.document_counters(prefix, running_number)
values ('PO', 0)
on conflict (prefix) do nothing;

create index if not exists purchases_supplier_idx on public.purchases (supplier_id);
create index if not exists purchases_purchased_at_idx on public.purchases (purchased_at desc);
create index if not exists purchases_payment_status_idx on public.purchases (payment_status);
create index if not exists purchase_items_part_idx on public.purchase_items (part_id);

create or replace function public.create_purchase_with_stock(
  p_supplier_id uuid,
  p_purchased_at date,
  p_discount numeric,
  p_paid_amount numeric,
  p_payment_method text,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_id uuid;
  v_purchase_no text;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := greatest(coalesce(p_discount, 0), 0);
  v_paid_amount numeric(12,2) := greatest(coalesce(p_paid_amount, 0), 0);
  v_total numeric(12,2);
  v_balance_due numeric(12,2);
  v_payment_status text;
  v_item jsonb;
  v_part_id uuid;
  v_quantity numeric(12,2);
  v_unit_cost numeric(12,2);
  v_part record;
  v_supplier_exists boolean;
begin
  if not public.has_role(array['owner','manager','accountant']) then
    raise exception 'permission denied';
  end if;

  if p_payment_method not in ('cash','transfer','qr','other') then
    raise exception 'invalid payment method';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'purchase must have at least one item';
  end if;

  select exists(
    select 1 from public.suppliers
    where id = p_supplier_id and deleted_at is null
  ) into v_supplier_exists;

  if not v_supplier_exists then
    raise exception 'supplier not found';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) as items(value)
  loop
    v_part_id := (v_item->>'part_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_cost := (v_item->>'unit_cost')::numeric;

    if v_quantity <= 0 then
      raise exception 'quantity must be greater than 0';
    end if;

    if v_unit_cost < 0 then
      raise exception 'unit cost cannot be negative';
    end if;

    if not exists(select 1 from public.parts where id = v_part_id and deleted_at is null) then
      raise exception 'part not found';
    end if;

    v_subtotal := v_subtotal + (v_quantity * v_unit_cost);
  end loop;

  v_total := greatest(v_subtotal - v_discount, 0);

  if v_paid_amount > v_total then
    raise exception 'paid amount cannot exceed purchase total';
  end if;

  v_balance_due := v_total - v_paid_amount;
  v_payment_status := case
    when v_total <= 0 or v_balance_due <= 0 then 'paid'
    when v_paid_amount > 0 then 'partial'
    else 'unpaid'
  end;

  v_purchase_no := public.next_document_number('PO');

  insert into public.purchases (
    supplier_id,
    purchase_no,
    purchased_at,
    subtotal,
    discount,
    total,
    paid_amount,
    balance_due,
    payment_status,
    notes,
    created_by
  )
  values (
    p_supplier_id,
    v_purchase_no,
    coalesce(p_purchased_at, current_date),
    v_subtotal,
    v_discount,
    v_total,
    v_paid_amount,
    v_balance_due,
    v_payment_status,
    nullif(p_notes, ''),
    auth.uid()
  )
  returning id into v_purchase_id;

  for v_item in select value from jsonb_array_elements(p_items) as items(value)
  loop
    v_part_id := (v_item->>'part_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit_cost := (v_item->>'unit_cost')::numeric;

    select * into v_part
    from public.parts
    where id = v_part_id and deleted_at is null
    for update;

    if not found then
      raise exception 'part not found';
    end if;

    insert into public.purchase_items (purchase_id, part_id, quantity, unit_cost)
    values (v_purchase_id, v_part_id, v_quantity, v_unit_cost);

    update public.parts
    set quantity_on_hand = quantity_on_hand + v_quantity,
        cost_price = v_unit_cost,
        supplier_id = p_supplier_id,
        updated_at = now()
    where id = v_part_id;

    insert into public.stock_movements (
      part_id,
      movement_type,
      quantity,
      unit_cost,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    values (
      v_part_id,
      'purchase',
      v_quantity,
      v_unit_cost,
      'purchase',
      v_purchase_id,
      'Stock received from purchase ' || v_purchase_no,
      auth.uid()
    );
  end loop;

  if v_balance_due > 0 then
    update public.suppliers
    set credit_balance = credit_balance + v_balance_due,
        updated_at = now()
    where id = p_supplier_id;
  end if;

  if v_paid_amount > 0 then
    insert into public.expense_records (
      recorded_at,
      category,
      description,
      amount,
      payment_method,
      supplier_id,
      created_by
    )
    values (
      coalesce(p_purchased_at, current_date),
      'parts_purchase',
      'Paid for purchase ' || v_purchase_no,
      v_paid_amount,
      p_payment_method,
      p_supplier_id,
      auth.uid()
    );
  end if;

  insert into public.activity_logs (actor_id, action, table_name, record_id, metadata)
  values (
    auth.uid(),
    'create_purchase',
    'purchases',
    v_purchase_id,
    jsonb_build_object(
      'purchase_no', v_purchase_no,
      'total', v_total,
      'paid_amount', v_paid_amount,
      'balance_due', v_balance_due
    )
  );

  return jsonb_build_object(
    'id', v_purchase_id,
    'purchase_no', v_purchase_no,
    'total', v_total,
    'paid_amount', v_paid_amount,
    'balance_due', v_balance_due,
    'payment_status', v_payment_status
  );
end;
$$;

create or replace function public.pay_supplier_purchase(
  p_purchase_id uuid,
  p_paid_at date,
  p_amount numeric,
  p_payment_method text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase record;
  v_amount numeric(12,2) := coalesce(p_amount, 0);
  v_paid_amount numeric(12,2);
  v_balance_due numeric(12,2);
  v_payment_status text;
begin
  if not public.has_role(array['owner','manager','accountant']) then
    raise exception 'permission denied';
  end if;

  if p_payment_method not in ('cash','transfer','qr','other') then
    raise exception 'invalid payment method';
  end if;

  if v_amount <= 0 then
    raise exception 'payment amount must be greater than 0';
  end if;

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id and deleted_at is null
  for update;

  if not found then
    raise exception 'purchase not found';
  end if;

  if v_purchase.payment_status = 'cancelled' then
    raise exception 'cancelled purchase cannot be paid';
  end if;

  if v_amount > v_purchase.balance_due then
    raise exception 'payment amount cannot exceed balance due';
  end if;

  v_paid_amount := v_purchase.paid_amount + v_amount;
  v_balance_due := greatest(v_purchase.total - v_paid_amount, 0);
  v_payment_status := case when v_balance_due <= 0 then 'paid' else 'partial' end;

  update public.purchases
  set paid_amount = v_paid_amount,
      balance_due = v_balance_due,
      payment_status = v_payment_status,
      updated_at = now()
  where id = p_purchase_id;

  update public.suppliers
  set credit_balance = greatest(credit_balance - v_amount, 0),
      updated_at = now()
  where id = v_purchase.supplier_id;

  insert into public.expense_records (
    recorded_at,
    category,
    description,
    amount,
    payment_method,
    supplier_id,
    created_by
  )
  values (
    coalesce(p_paid_at, current_date),
    'parts_purchase',
    'Supplier payment for purchase ' || v_purchase.purchase_no,
    v_amount,
    p_payment_method,
    v_purchase.supplier_id,
    auth.uid()
  );

  insert into public.activity_logs (actor_id, action, table_name, record_id, metadata)
  values (
    auth.uid(),
    'pay_supplier_purchase',
    'purchases',
    p_purchase_id,
    jsonb_build_object(
      'purchase_no', v_purchase.purchase_no,
      'amount', v_amount,
      'payment_method', p_payment_method,
      'notes', nullif(p_notes, ''),
      'balance_due', v_balance_due
    )
  );

  return jsonb_build_object(
    'id', p_purchase_id,
    'purchase_no', v_purchase.purchase_no,
    'paid_amount', v_paid_amount,
    'balance_due', v_balance_due,
    'payment_status', v_payment_status
  );
end;
$$;

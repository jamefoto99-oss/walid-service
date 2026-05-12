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
  v_part_id_text text;
  v_part_code text;
  v_part_name text;
  v_unit text;
  v_sale_price numeric(12,2);
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
    v_part_id_text := nullif(trim(coalesce(v_item->>'part_id', '')), '');
    v_quantity := coalesce(nullif(v_item->>'quantity', '')::numeric, 0);
    v_unit_cost := coalesce(nullif(v_item->>'unit_cost', '')::numeric, 0);

    if v_quantity <= 0 then
      raise exception 'quantity must be greater than 0';
    end if;

    if v_unit_cost < 0 then
      raise exception 'unit cost cannot be negative';
    end if;

    if v_part_id_text is not null then
      v_part_id := v_part_id_text::uuid;

      if not exists(select 1 from public.parts where id = v_part_id and deleted_at is null) then
        raise exception 'part not found';
      end if;
    else
      v_part_code := nullif(trim(coalesce(v_item->>'part_code', '')), '');
      v_part_name := nullif(trim(coalesce(v_item->>'name', '')), '');

      if v_part_code is null then
        raise exception 'new part code is required';
      end if;

      if v_part_name is null then
        raise exception 'new part name is required';
      end if;
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
    v_part_id_text := nullif(trim(coalesce(v_item->>'part_id', '')), '');
    v_quantity := coalesce(nullif(v_item->>'quantity', '')::numeric, 0);
    v_unit_cost := coalesce(nullif(v_item->>'unit_cost', '')::numeric, 0);

    if v_part_id_text is not null then
      v_part_id := v_part_id_text::uuid;

      select * into v_part
      from public.parts
      where id = v_part_id and deleted_at is null
      for update;

      if not found then
        raise exception 'part not found';
      end if;
    else
      v_part_code := nullif(trim(coalesce(v_item->>'part_code', '')), '');
      v_part_name := nullif(trim(coalesce(v_item->>'name', '')), '');
      v_unit := coalesce(nullif(trim(coalesce(v_item->>'unit', '')), ''), 'ชิ้น');
      v_sale_price := greatest(coalesce(nullif(v_item->>'sale_price', '')::numeric, v_unit_cost), 0);

      select * into v_part
      from public.parts
      where part_code = v_part_code
      for update;

      if found then
        v_part_id := v_part.id;

        update public.parts
        set name = v_part_name,
            cost_price = v_unit_cost,
            sale_price = v_sale_price,
            unit = v_unit,
            supplier_id = p_supplier_id,
            deleted_at = null,
            updated_at = now()
        where id = v_part_id;
      else
        insert into public.parts (
          part_code,
          name,
          cost_price,
          sale_price,
          quantity_on_hand,
          unit,
          supplier_id
        )
        values (
          v_part_code,
          v_part_name,
          v_unit_cost,
          v_sale_price,
          0,
          v_unit,
          p_supplier_id
        )
        returning * into v_part;

        v_part_id := v_part.id;

        insert into public.activity_logs (actor_id, action, table_name, record_id, metadata)
        values (
          auth.uid(),
          'create_inline_part_from_purchase',
          'parts',
          v_part_id,
          jsonb_build_object(
            'part_code', v_part_code,
            'name', v_part_name,
            'purchase_no', v_purchase_no
          )
        );
      end if;
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

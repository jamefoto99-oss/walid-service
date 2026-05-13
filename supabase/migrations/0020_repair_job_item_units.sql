alter table public.repair_job_items
add column if not exists unit text not null default 'รายการ';

update public.repair_job_items item
set unit = coalesce(nullif(trim(part.unit), ''), 'ชิ้น')
from public.parts part
where item.part_id = part.id
  and (item.unit is null or item.unit = '' or item.unit = 'รายการ');

drop function if exists public.update_repair_job_item(uuid, uuid, text, text, numeric, numeric, numeric, uuid);

create or replace function public.update_repair_job_item(
  p_job_id uuid,
  p_item_id uuid,
  p_title text,
  p_description text,
  p_labor_price numeric,
  p_quantity numeric,
  p_discount numeric,
  p_part_id uuid default null,
  p_unit text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_old_part record;
  v_new_part record;
  v_labor_price numeric(12,2) := coalesce(p_labor_price, 0);
  v_quantity numeric(12,2) := coalesce(p_quantity, 0);
  v_discount numeric(12,2) := greatest(coalesce(p_discount, 0), 0);
  v_unit text := coalesce(nullif(trim(coalesce(p_unit, '')), ''), 'รายการ');
  v_delta numeric(12,2);
  v_total numeric(12,2);
begin
  if v_labor_price < 0 then
    raise exception 'price cannot be negative';
  end if;

  if v_quantity <= 0 then
    raise exception 'quantity must be greater than 0';
  end if;

  select *
  into v_item
  from public.repair_job_items
  where id = p_item_id
    and repair_job_id = p_job_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'repair job item not found';
  end if;

  if v_item.part_id is not null or p_part_id is not null then
    if not public.has_role(array['owner','manager','accountant']) then
      raise exception 'permission denied';
    end if;
  elsif not public.has_role(array['owner','manager','staff']) then
    raise exception 'permission denied';
  end if;

  if p_part_id is not null then
    select *
    into v_new_part
    from public.parts
    where id = p_part_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'part not found';
    end if;

    v_unit := coalesce(nullif(trim(coalesce(p_unit, '')), ''), nullif(trim(coalesce(v_new_part.unit, '')), ''), 'ชิ้น');

    if v_item.part_id is not null and v_item.part_id <> p_part_id then
      select *
      into v_old_part
      from public.parts
      where id = v_item.part_id
      for update;

      update public.parts
      set quantity_on_hand = quantity_on_hand + v_item.quantity,
          updated_at = now()
      where id = v_item.part_id;

      insert into public.stock_movements (
        part_id,
        movement_type,
        quantity,
        unit_cost,
        reference_type,
        reference_id,
        repair_job_item_id,
        notes,
        created_by
      )
      values (
        v_item.part_id,
        'return',
        v_item.quantity,
        v_item.labor_price,
        'repair_job',
        p_job_id,
        p_item_id,
        'Returned old part while editing repair job item',
        auth.uid()
      );

      if v_new_part.quantity_on_hand < v_quantity then
        raise exception 'stock not enough for selected part';
      end if;

      update public.parts
      set quantity_on_hand = quantity_on_hand - v_quantity,
          updated_at = now()
      where id = p_part_id;

      insert into public.stock_movements (
        part_id,
        movement_type,
        quantity,
        unit_cost,
        reference_type,
        reference_id,
        repair_job_item_id,
        notes,
        created_by
      )
      values (
        p_part_id,
        'use',
        -v_quantity,
        v_labor_price,
        'repair_job',
        p_job_id,
        p_item_id,
        'Used new part while editing repair job item',
        auth.uid()
      );
    elsif v_item.part_id is not null then
      v_delta := v_quantity - v_item.quantity;

      if v_delta > 0 and v_new_part.quantity_on_hand < v_delta then
        raise exception 'stock not enough for selected part';
      end if;

      if v_delta <> 0 then
        update public.parts
        set quantity_on_hand = quantity_on_hand - v_delta,
            updated_at = now()
        where id = p_part_id;

        insert into public.stock_movements (
          part_id,
          movement_type,
          quantity,
          unit_cost,
          reference_type,
          reference_id,
          repair_job_item_id,
          notes,
          created_by
        )
        values (
          p_part_id,
          case when v_delta > 0 then 'use' else 'return' end,
          -v_delta,
          v_labor_price,
          'repair_job',
          p_job_id,
          p_item_id,
          'Adjusted part quantity while editing repair job item',
          auth.uid()
        );
      end if;
    else
      if v_new_part.quantity_on_hand < v_quantity then
        raise exception 'stock not enough for selected part';
      end if;

      update public.parts
      set quantity_on_hand = quantity_on_hand - v_quantity,
          updated_at = now()
      where id = p_part_id;

      insert into public.stock_movements (
        part_id,
        movement_type,
        quantity,
        unit_cost,
        reference_type,
        reference_id,
        repair_job_item_id,
        notes,
        created_by
      )
      values (
        p_part_id,
        'use',
        -v_quantity,
        v_labor_price,
        'repair_job',
        p_job_id,
        p_item_id,
        'Used part while editing repair job item',
        auth.uid()
      );
    end if;

    update public.repair_job_items
    set part_id = p_part_id,
        title = 'อะไหล่: ' || v_new_part.name,
        description = coalesce(nullif(trim(p_description), ''), v_new_part.part_code || ' เบิกใช้ ' || v_quantity || ' ' || v_unit),
        labor_price = v_labor_price,
        quantity = v_quantity,
        unit = v_unit,
        discount = v_discount,
        updated_at = now()
    where id = p_item_id;
  else
    if nullif(trim(coalesce(p_title, '')), '') is null then
      raise exception 'title is required';
    end if;

    if v_item.part_id is not null then
      update public.parts
      set quantity_on_hand = quantity_on_hand + v_item.quantity,
          updated_at = now()
      where id = v_item.part_id;

      insert into public.stock_movements (
        part_id,
        movement_type,
        quantity,
        unit_cost,
        reference_type,
        reference_id,
        repair_job_item_id,
        notes,
        created_by
      )
      values (
        v_item.part_id,
        'return',
        v_item.quantity,
        v_item.labor_price,
        'repair_job',
        p_job_id,
        p_item_id,
        'Returned part while converting repair job item to labor',
        auth.uid()
      );
    end if;

    update public.repair_job_items
    set part_id = null,
        title = trim(p_title),
        description = nullif(trim(coalesce(p_description, '')), ''),
        labor_price = v_labor_price,
        quantity = v_quantity,
        unit = v_unit,
        discount = v_discount,
        updated_at = now()
    where id = p_item_id;
  end if;

  select coalesce(sum(total), 0)
  into v_total
  from public.repair_job_items
  where repair_job_id = p_job_id
    and deleted_at is null;

  update public.repair_jobs
  set estimated_total = v_total,
      updated_at = now()
  where id = p_job_id;

  insert into public.activity_logs (actor_id, action, table_name, record_id, metadata)
  values (
    auth.uid(),
    'update_repair_job_item',
    'repair_jobs',
    p_job_id,
    jsonb_build_object(
      'item_id', p_item_id,
      'part_id', p_part_id,
      'quantity', v_quantity,
      'unit', v_unit,
      'labor_price', v_labor_price,
      'discount', v_discount
    )
  );

  return jsonb_build_object('id', p_item_id, 'estimated_total', v_total);
end;
$$;

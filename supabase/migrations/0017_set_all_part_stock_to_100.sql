with adjusted_parts as (
  select
    id,
    quantity_on_hand,
    cost_price
  from public.parts
  where deleted_at is null
    and quantity_on_hand <> 100
),
stock_adjustments as (
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
  select
    id,
    'adjustment',
    100 - quantity_on_hand,
    cost_price,
    'bulk_stock_adjustment',
    null,
    'Set all active part stock to 100 units',
    null
  from adjusted_parts
  returning part_id
)
update public.parts
set quantity_on_hand = 100,
    updated_at = now()
where deleted_at is null
  and quantity_on_hand <> 100;

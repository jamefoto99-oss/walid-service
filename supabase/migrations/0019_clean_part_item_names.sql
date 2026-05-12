with patterns as (
  select
    '[[:space:]]*[(][[:space:]]*[0-9,]+([.][0-9]+)?[[:space:]]*[*xX][[:space:]]*[0-9,]+([.][0-9]+)?[[:space:]]*[)][[:space:]]*$'::text as price_qty_pattern,
    '[[:space:]]+[0-9]+([.][0-9]+)?[[:space:]]+[^[:space:]]+[[:space:]]*$'::text as count_unit_pattern
),
cleaned_parts as (
  select
    p.id,
    p.name as old_name,
    btrim(
      regexp_replace(
        regexp_replace(p.name, patterns.price_qty_pattern, ''),
        patterns.count_unit_pattern,
        ''
      )
    ) as cleaned_name
  from public.parts p
  cross join patterns
  where p.name ~ patterns.price_qty_pattern
),
updated_parts as (
  update public.parts p
  set name = c.cleaned_name,
      updated_at = now()
  from cleaned_parts c
  where p.id = c.id
    and c.cleaned_name <> ''
    and c.cleaned_name <> p.name
  returning p.id, c.old_name, c.cleaned_name
)
insert into public.activity_logs (actor_id, action, table_name, record_id, metadata)
select
  null,
  'clean_part_item_names',
  'parts',
  null,
  jsonb_build_object(
    'updated_count', count(*),
    'rule', 'remove trailing price*quantity parentheses and count/unit text from part names'
  )
from updated_parts
having count(*) > 0;

alter table public.quotation_items
  add column if not exists unit text not null default 'ชิ้น';

alter table public.invoice_items
  add column if not exists unit text not null default 'ชิ้น';

update public.quotation_items qi
set unit = coalesce(p.unit, 'ชิ้น')
from public.parts p
where qi.part_id = p.id
  and (qi.unit is null or qi.unit = 'ชิ้น');

update public.invoice_items ii
set unit = coalesce(p.unit, 'ชิ้น')
from public.parts p
where ii.part_id = p.id
  and (ii.unit is null or ii.unit = 'ชิ้น');

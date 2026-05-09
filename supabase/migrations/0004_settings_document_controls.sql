alter table public.company_settings
add column if not exists purchase_prefix text not null default 'PO';

insert into public.document_counters(prefix, running_number)
values ('JOB', 0), ('QT', 0), ('INV', 0), ('RC', 0), ('PO', 0)
on conflict (prefix) do nothing;

drop policy if exists counters_owner_write on public.document_counters;

create policy counters_owner_write
on public.document_counters
for all
to authenticated
using (public.has_role(array['owner']))
with check (public.has_role(array['owner']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-assets',
  'company-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists company_assets_public_read on storage.objects;
drop policy if exists company_assets_insert on storage.objects;
drop policy if exists company_assets_update on storage.objects;
drop policy if exists company_assets_delete on storage.objects;

create policy company_assets_public_read
on storage.objects
for select
to public
using (bucket_id = 'company-assets');

create policy company_assets_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'company-assets'
  and public.has_role(array['owner'])
);

create policy company_assets_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'company-assets'
  and public.has_role(array['owner'])
)
with check (
  bucket_id = 'company-assets'
  and public.has_role(array['owner'])
);

create policy company_assets_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'company-assets'
  and public.has_role(array['owner'])
);

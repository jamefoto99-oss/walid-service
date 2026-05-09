insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'repair-job-images',
  'repair-job-images',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists repair_job_images_read on storage.objects;
drop policy if exists repair_job_images_insert on storage.objects;
drop policy if exists repair_job_images_update on storage.objects;
drop policy if exists repair_job_images_delete on storage.objects;

create policy repair_job_images_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'repair-job-images'
  and public.is_active_user()
);

create policy repair_job_images_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'repair-job-images'
  and public.has_role(array['owner','manager','staff'])
);

create policy repair_job_images_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'repair-job-images'
  and public.has_role(array['owner','manager','staff'])
)
with check (
  bucket_id = 'repair-job-images'
  and public.has_role(array['owner','manager','staff'])
);

create policy repair_job_images_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'repair-job-images'
  and public.has_role(array['owner','manager','staff'])
);

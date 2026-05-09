create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null default 'delete_document' check (request_type in ('delete_document')),
  action text not null default 'soft_delete' check (action in ('soft_delete')),
  target_table text not null check (target_table in ('purchases','quotations','invoices','receipts')),
  target_id uuid not null,
  target_label text not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_requests_review_state check (
    (
      status = 'pending'
      and reviewed_by is null
      and reviewed_at is null
    )
    or (
      status in ('approved','rejected')
      and reviewed_by is not null
      and reviewed_at is not null
    )
  )
);

drop trigger if exists touch_approval_requests on public.approval_requests;
create trigger touch_approval_requests
before update on public.approval_requests
for each row execute function public.touch_updated_at();

create unique index if not exists approval_requests_pending_target_idx
on public.approval_requests (target_table, target_id, action)
where status = 'pending';

create index if not exists approval_requests_status_idx
on public.approval_requests (status, created_at desc);

create index if not exists approval_requests_requested_by_idx
on public.approval_requests (requested_by, created_at desc);

create index if not exists approval_requests_reviewed_by_idx
on public.approval_requests (reviewed_by, reviewed_at desc);

create index if not exists approval_requests_target_idx
on public.approval_requests (target_table, target_id);

alter table public.approval_requests enable row level security;

drop policy if exists approval_requests_read on public.approval_requests;
create policy approval_requests_read
on public.approval_requests
for select
to authenticated
using (
  requested_by = auth.uid()
  or public.has_role(array['owner'])
);

drop policy if exists approval_requests_insert_own on public.approval_requests;
create policy approval_requests_insert_own
on public.approval_requests
for insert
to authenticated
with check (
  public.is_active_user()
  and requested_by = auth.uid()
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
);

drop policy if exists approval_requests_owner_update on public.approval_requests;
create policy approval_requests_owner_update
on public.approval_requests
for update
to authenticated
using (public.has_role(array['owner']))
with check (public.has_role(array['owner']));

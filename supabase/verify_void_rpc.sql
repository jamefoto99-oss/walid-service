begin;

do $$
declare
  v_admin_id uuid;
  v_receipt_id uuid;
  v_invoice_id uuid;
  v_purchase_id uuid;
  v_result jsonb;
begin
  select id
  into v_admin_id
  from public.profiles
  where role = 'owner'
    and is_active is true
  order by created_at
  limit 1;

  if v_admin_id is null then
    raise exception 'No active owner profile found for RPC verification';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select id
  into v_receipt_id
  from public.receipts
  where receipt_no = 'RC-SMOKE-0001'
    and deleted_at is null
    and voided_at is null
  limit 1;

  if v_receipt_id is null then
    raise exception 'Active RC-SMOKE-0001 receipt not found. Run npm run db:seed:smoke first.';
  end if;

  v_result := public.void_receipt_transaction(v_receipt_id, 'RPC rollback verification');

  if (v_result ->> 'receipt_id')::uuid <> v_receipt_id then
    raise exception 'void_receipt_transaction returned unexpected receipt id';
  end if;

  select id
  into v_invoice_id
  from public.invoices
  where invoice_no = 'INV-SMOKE-0001'
    and deleted_at is null
    and voided_at is null
  limit 1;

  if v_invoice_id is null then
    raise exception 'Active INV-SMOKE-0001 invoice not found. Run npm run db:seed:smoke first.';
  end if;

  v_result := public.void_invoice_transaction(v_invoice_id, 'RPC rollback verification');

  if (v_result ->> 'invoice_id')::uuid <> v_invoice_id then
    raise exception 'void_invoice_transaction returned unexpected invoice id';
  end if;

  select id
  into v_purchase_id
  from public.purchases
  where purchase_no = 'PO-SMOKE-0001'
    and deleted_at is null
    and voided_at is null
  limit 1;

  if v_purchase_id is null then
    raise exception 'Active PO-SMOKE-0001 purchase not found. Run npm run db:seed:smoke first.';
  end if;

  v_result := public.void_purchase_transaction(v_purchase_id, 'RPC rollback verification');

  if (v_result ->> 'purchase_id')::uuid <> v_purchase_id then
    raise exception 'void_purchase_transaction returned unexpected purchase id';
  end if;

  raise notice 'Void RPC verification passed. Rolling back test transaction.';
end $$;

rollback;

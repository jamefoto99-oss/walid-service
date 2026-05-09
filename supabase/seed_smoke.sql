do $$
declare
  admin_id uuid;
  c1 uuid := '10000000-0000-4000-8000-000000000001';
  c2 uuid := '10000000-0000-4000-8000-000000000002';
  v1 uuid := '10000000-0000-4000-8000-000000000011';
  v2 uuid := '10000000-0000-4000-8000-000000000012';
  supplier1 uuid := '10000000-0000-4000-8000-000000000021';
  category1 uuid := '10000000-0000-4000-8000-000000000031';
  part1 uuid := '10000000-0000-4000-8000-000000000041';
  part2 uuid := '10000000-0000-4000-8000-000000000042';
  purchase1 uuid := '10000000-0000-4000-8000-000000000051';
  job1 uuid := '10000000-0000-4000-8000-000000000061';
  quote1 uuid := '10000000-0000-4000-8000-000000000071';
  invoice1 uuid := '10000000-0000-4000-8000-000000000081';
  receipt1 uuid := '10000000-0000-4000-8000-000000000091';
  approval1 uuid := '10000000-0000-4000-8000-0000000000a1';
begin
  select id into admin_id
  from public.profiles
  where role = 'owner' and is_active is true
  order by created_at
  limit 1;

  if admin_id is null then
    raise exception 'No active owner profile found. Run supabase/seed.sql or create an owner profile first.';
  end if;

  update public.vehicles v
  set deleted_at = now()
  where v.deleted_at is null
    and exists (
      select 1
      from public.customers c
      where c.id = v.customer_id
        and c.deleted_at is not null
    );

  insert into public.customers (
    id, full_name, phone, address, line_id, notes, outstanding_balance, created_by, deleted_at
  ) values
    (c1, 'ลูกค้า Smoke Test 1', '080-000-1001', 'ขอนแก่น', 'smoke.customer1', 'ข้อมูลสำหรับตรวจ flow อัตโนมัติ', 7000, admin_id, null),
    (c2, 'ลูกค้า Smoke Test 2', '080-000-1002', 'ขอนแก่น', 'smoke.customer2', 'ข้อมูลสำรองสำหรับ flow รถยนต์', 0, admin_id, null)
  on conflict (id) do update
  set full_name = excluded.full_name,
      phone = excluded.phone,
      address = excluded.address,
      line_id = excluded.line_id,
      notes = excluded.notes,
      outstanding_balance = excluded.outstanding_balance,
      created_by = excluded.created_by,
      deleted_at = null,
      updated_at = now();

  insert into public.vehicles (
    id, customer_id, license_plate, province, brand, model, year, color, mileage, vin, engine_no, notes, created_by, deleted_at
  ) values
    (v1, c1, 'SMOKE-1001', 'ขอนแก่น', 'Toyota', 'Vigo', 2012, 'ขาว', 185200, 'SMOKEVIN001', 'SMOKEENG001', 'รถสำหรับตรวจ flow เปิดงานซ่อม', admin_id, null),
    (v2, c2, 'SMOKE-1002', 'ขอนแก่น', 'Honda', 'City', 2018, 'เทา', 82200, 'SMOKEVIN002', 'SMOKEENG002', 'รถสำรองสำหรับ smoke test', admin_id, null)
  on conflict (id) do update
  set customer_id = excluded.customer_id,
      license_plate = excluded.license_plate,
      province = excluded.province,
      brand = excluded.brand,
      model = excluded.model,
      year = excluded.year,
      color = excluded.color,
      mileage = excluded.mileage,
      vin = excluded.vin,
      engine_no = excluded.engine_no,
      notes = excluded.notes,
      created_by = excluded.created_by,
      deleted_at = null,
      updated_at = now();

  insert into public.suppliers (
    id, name, phone, address, regular_items, credit_balance, notes, deleted_at
  ) values (
    supplier1, 'Supplier Smoke Test', '043-000-100', 'ขอนแก่น', 'คลัทช์ ลูกปืน น้ำมันเครื่อง', 3250, 'ข้อมูลสำหรับตรวจ flow เจ้าหนี้', null
  )
  on conflict (id) do update
  set name = excluded.name,
      phone = excluded.phone,
      address = excluded.address,
      regular_items = excluded.regular_items,
      credit_balance = excluded.credit_balance,
      notes = excluded.notes,
      deleted_at = null,
      updated_at = now();

  insert into public.part_categories (id, name)
  values (category1, 'Smoke Test Parts')
  on conflict (id) do update
  set name = excluded.name,
      updated_at = now();

  insert into public.parts (
    id, part_code, name, category_id, cost_price, sale_price, quantity_on_hand, unit, supplier_id, low_stock_threshold, notes, deleted_at
  ) values
    (part1, 'SMK-CL-001', 'ชุดคลัทช์ Smoke Test', category1, 3200, 4500, 8, 'ชุด', supplier1, 2, 'อะไหล่สำหรับ smoke test', null),
    (part2, 'SMK-BR-010', 'ลูกปืนคลัทช์ Smoke Test', category1, 650, 950, 12, 'ชิ้น', supplier1, 3, 'อะไหล่สำหรับ smoke test', null)
  on conflict (id) do update
  set part_code = excluded.part_code,
      name = excluded.name,
      category_id = excluded.category_id,
      cost_price = excluded.cost_price,
      sale_price = excluded.sale_price,
      quantity_on_hand = excluded.quantity_on_hand,
      unit = excluded.unit,
      supplier_id = excluded.supplier_id,
      low_stock_threshold = excluded.low_stock_threshold,
      notes = excluded.notes,
      deleted_at = null,
      updated_at = now();

  insert into public.purchases (
    id, supplier_id, purchase_no, purchased_at, subtotal, discount, total,
    paid_amount, balance_due, payment_status, notes, created_by, deleted_at,
    voided_at, voided_by, void_reason
  ) values (
    purchase1, supplier1, 'PO-SMOKE-0001', current_date, 9650, 0, 9650,
    6400, 3250, 'partial', 'ใบซื้อสำหรับตรวจ flow ซื้ออะไหล่และเจ้าหนี้', admin_id, null,
    null, null, null
  )
  on conflict (id) do update
  set supplier_id = excluded.supplier_id,
      purchase_no = excluded.purchase_no,
      purchased_at = excluded.purchased_at,
      subtotal = excluded.subtotal,
      discount = excluded.discount,
      total = excluded.total,
      paid_amount = excluded.paid_amount,
      balance_due = excluded.balance_due,
      payment_status = excluded.payment_status,
      notes = excluded.notes,
      created_by = excluded.created_by,
      deleted_at = null,
      voided_at = null,
      voided_by = null,
      void_reason = null,
      updated_at = now();

  delete from public.purchase_items where purchase_id = purchase1;
  insert into public.purchase_items (purchase_id, part_id, quantity, unit_cost) values
    (purchase1, part1, 2, 3200),
    (purchase1, part2, 5, 650);

  insert into public.repair_jobs (
    id, job_number, received_at, customer_id, vehicle_id, reported_problem, preliminary_check,
    intake_mileage, images, valuables, receiver_id, status, internal_notes, estimated_total, created_by, deleted_at
  ) values (
    job1, 'JOB-SMOKE-0001', current_date, c1, v1,
    'เข้าเกียร์ยาก คลัทช์ลื่นเวลาเร่ง',
    'ทดลองขับแล้วพบอาการคลัทช์ลื่น มีเสียงลูกปืน',
    185200, array['https://example.com/smoke-car-before.jpg'], 'ไม่มี', admin_id,
    'waiting_payment', 'งานตัวอย่างสำหรับตรวจ flow ตั้งแต่รับรถถึงรับเงิน', 8500, admin_id, null
  )
  on conflict (id) do update
  set job_number = excluded.job_number,
      received_at = excluded.received_at,
      customer_id = excluded.customer_id,
      vehicle_id = excluded.vehicle_id,
      reported_problem = excluded.reported_problem,
      preliminary_check = excluded.preliminary_check,
      intake_mileage = excluded.intake_mileage,
      images = excluded.images,
      valuables = excluded.valuables,
      receiver_id = excluded.receiver_id,
      status = excluded.status,
      internal_notes = excluded.internal_notes,
      estimated_total = excluded.estimated_total,
      created_by = excluded.created_by,
      deleted_at = null,
      updated_at = now();

  delete from public.repair_job_items where repair_job_id = job1;
  insert into public.repair_job_items (repair_job_id, title, description, labor_price, quantity, discount) values
    (job1, 'ยกเกียร์และเปลี่ยนคลัทช์', 'ถอดประกอบเกียร์ ตรวจเช็กชุดคลัทช์ และประกอบกลับ', 3000, 1, 0),
    (job1, 'อะไหล่: ชุดคลัทช์ Smoke Test', 'SMK-CL-001 เบิกใช้ 1 ชุด', 4500, 1, 500),
    (job1, 'อะไหล่: ลูกปืนคลัทช์ Smoke Test', 'SMK-BR-010 เบิกใช้ 1 ชิ้น', 950, 1, 0);

  insert into public.quotations (
    id, quotation_no, issued_at, customer_id, vehicle_id, repair_job_id,
    subtotal, discount, total, notes, terms, status, created_by, deleted_at
  ) values (
    quote1, 'QT-SMOKE-0001', current_date, c1, v1, job1,
    9400, 900, 8500, 'ราคานี้รวมค่าแรงแล้ว', 'ใบเสนอราคามีผล 7 วัน', 'approved', admin_id, null
  )
  on conflict (id) do update
  set quotation_no = excluded.quotation_no,
      issued_at = excluded.issued_at,
      customer_id = excluded.customer_id,
      vehicle_id = excluded.vehicle_id,
      repair_job_id = excluded.repair_job_id,
      subtotal = excluded.subtotal,
      discount = excluded.discount,
      total = excluded.total,
      notes = excluded.notes,
      terms = excluded.terms,
      status = excluded.status,
      created_by = excluded.created_by,
      deleted_at = null,
      updated_at = now();

  delete from public.quotation_items where quotation_id = quote1;
  insert into public.quotation_items (quotation_id, item_type, part_id, description, quantity, unit_price, discount, total, sort_order) values
    (quote1, 'labor', null, 'ยกเกียร์และเปลี่ยนคลัทช์', 1, 3000, 0, 3000, 1),
    (quote1, 'part', part1, 'ชุดคลัทช์ Smoke Test', 1, 4500, 500, 4000, 2),
    (quote1, 'part', part2, 'ลูกปืนคลัทช์ Smoke Test', 1, 950, 0, 950, 3),
    (quote1, 'other', null, 'น้ำมันเกียร์', 1, 950, 400, 550, 4);

  insert into public.invoices (
    id, invoice_no, quotation_id, issued_at, due_at, customer_id, vehicle_id, repair_job_id,
    subtotal, discount, total, paid_amount, balance_due, payment_status, notes, created_by, deleted_at,
    voided_at, voided_by, void_reason
  ) values (
    invoice1, 'INV-SMOKE-0001', quote1, current_date, current_date + interval '7 days', c1, v1, job1,
    9400, 900, 8500, 1500, 7000, 'partial', 'ใบแจ้งหนี้สำหรับตรวจ flow รับชำระบางส่วน', admin_id, null,
    null, null, null
  )
  on conflict (id) do update
  set invoice_no = excluded.invoice_no,
      quotation_id = excluded.quotation_id,
      issued_at = excluded.issued_at,
      due_at = excluded.due_at,
      customer_id = excluded.customer_id,
      vehicle_id = excluded.vehicle_id,
      repair_job_id = excluded.repair_job_id,
      subtotal = excluded.subtotal,
      discount = excluded.discount,
      total = excluded.total,
      paid_amount = excluded.paid_amount,
      balance_due = excluded.balance_due,
      payment_status = excluded.payment_status,
      notes = excluded.notes,
      created_by = excluded.created_by,
      deleted_at = null,
      voided_at = null,
      voided_by = null,
      void_reason = null,
      updated_at = now();

  delete from public.invoice_items where invoice_id = invoice1;
  insert into public.invoice_items (invoice_id, item_type, part_id, description, quantity, unit_price, discount, total, sort_order)
  select invoice1, item_type, part_id, description, quantity, unit_price, discount, total, sort_order
  from public.quotation_items
  where quotation_id = quote1;

  insert into public.receipts (
    id, receipt_no, received_at, customer_id, invoice_id, payment_method, amount, notes, created_by, deleted_at,
    voided_at, voided_by, void_reason
  ) values (
    receipt1, 'RC-SMOKE-0001', current_date, c1, invoice1, 'cash', 1500,
    'ใบเสร็จสำหรับตรวจ flow รับชำระบางส่วน', admin_id, null, null, null, null
  )
  on conflict (id) do update
  set receipt_no = excluded.receipt_no,
      received_at = excluded.received_at,
      customer_id = excluded.customer_id,
      invoice_id = excluded.invoice_id,
      payment_method = excluded.payment_method,
      amount = excluded.amount,
      notes = excluded.notes,
      created_by = excluded.created_by,
      deleted_at = null,
      voided_at = null,
      voided_by = null,
      void_reason = null,
      updated_at = now();

  delete from public.payment_records where invoice_id = invoice1 or receipt_id = receipt1;
  insert into public.payment_records (
    invoice_id, receipt_id, paid_at, amount, payment_method, notes, created_by,
    voided_at, voided_by, void_reason
  ) values (
    invoice1, receipt1, current_date, 1500, 'cash', 'ชำระบางส่วนสำหรับ smoke test', admin_id,
    null, null, null
  );

  delete from public.income_records where receipt_id = receipt1 or reference_no = 'RC-SMOKE-0001';
  insert into public.income_records (
    recorded_at, category, description, amount, payment_method, reference_no, receipt_id, created_by, deleted_at,
    voided_at, voided_by, void_reason
  ) values (
    current_date, 'repair_service', 'รับชำระบางส่วน INV-SMOKE-0001', 1500, 'cash', 'RC-SMOKE-0001', receipt1, admin_id, null,
    null, null, null
  );

  delete from public.expense_records where description like '%PO-SMOKE-0001%';
  insert into public.expense_records (
    recorded_at, category, description, amount, payment_method, supplier_id, created_by, deleted_at,
    voided_at, voided_by, void_reason
  ) values (
    current_date, 'parts_purchase', 'จ่ายชำระใบซื้อ PO-SMOKE-0001', 6400, 'transfer', supplier1, admin_id, null,
    null, null, null
  );

  delete from public.stock_movements where reference_id in (purchase1, invoice1, job1);
  insert into public.stock_movements (part_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by) values
    (part1, 'purchase', 2, 3200, 'purchase', purchase1, 'รับเข้าจากใบซื้อ PO-SMOKE-0001', admin_id),
    (part2, 'purchase', 5, 650, 'purchase', purchase1, 'รับเข้าจากใบซื้อ PO-SMOKE-0001', admin_id),
    (part1, 'use', -1, 3200, 'invoice', invoice1, 'ตัดใช้ในใบแจ้งหนี้ INV-SMOKE-0001', admin_id),
    (part2, 'use', -1, 650, 'invoice', invoice1, 'ตัดใช้ในใบแจ้งหนี้ INV-SMOKE-0001', admin_id);

  delete from public.approval_requests
  where target_table = 'quotations'
    and target_id = quote1
    and action = 'soft_delete'
    and status = 'pending';

  insert into public.approval_requests (
    id, request_type, action, target_table, target_id, target_label,
    reason, status, requested_by, metadata
  ) values (
    approval1, 'delete_document', 'soft_delete', 'quotations', quote1, 'QT-SMOKE-0001',
    'คำขออนุมัติสำหรับตรวจ smoke test',
    'pending',
    admin_id,
    jsonb_build_object(
      'module_key', 'quotations',
      'module_title', 'ใบเสนอราคา',
      'amount', 8500,
      'current_status', 'approved',
      'requested_role', 'owner'
    )
  )
  on conflict (id) do update
  set reason = excluded.reason,
      status = 'pending',
      requested_by = excluded.requested_by,
      reviewed_by = null,
      reviewed_at = null,
      review_note = null,
      metadata = excluded.metadata,
      updated_at = now();

  insert into public.activity_logs (actor_id, action, table_name, record_id, metadata)
  values
    (admin_id, 'seed_smoke', 'repair_jobs', job1, jsonb_build_object('note', 'ensured smoke repair flow')),
    (admin_id, 'seed_smoke', 'invoices', invoice1, jsonb_build_object('note', 'ensured smoke billing flow')),
    (admin_id, 'seed_smoke', 'purchases', purchase1, jsonb_build_object('note', 'ensured smoke purchase flow'));

  insert into public.document_counters(prefix, running_number)
  values ('JOB', 1), ('QT', 1), ('INV', 1), ('RC', 1), ('PO', 1)
  on conflict (prefix) do update
  set running_number = greatest(public.document_counters.running_number, excluded.running_number);
end $$;

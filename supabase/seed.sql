insert into public.company_settings (
  company_name, address, phone, line_id, document_footer,
  quotation_prefix, invoice_prefix, receipt_prefix, repair_job_prefix,
  cash_bill_prefix, billing_statement_prefix, bank_name, bank_logo_url, bank_account_number, bank_account_name
) values (
  'อู่วาลิดการช่าง',
  '99/9 หมู่ 4 ตำบลในเมือง อำเภอเมือง จังหวัดขอนแก่น 40000',
  '081-234-5678',
  '@walidgarage',
  'ขอบคุณที่ไว้วางใจอู่วาลิดการช่าง',
  'QT', 'INV', 'RC', 'JOB',
  'CB', 'BL', 'ธนาคารกสิกรไทย', null, '123-4-56789-0', 'อู่วาลิดการช่าง'
) on conflict do nothing;

update public.company_settings
set cash_bill_prefix = coalesce(nullif(cash_bill_prefix, ''), 'CB'),
    billing_statement_prefix = coalesce(nullif(billing_statement_prefix, ''), 'BL'),
    bank_name = coalesce(bank_name, 'ธนาคารกสิกรไทย'),
    bank_account_number = coalesce(bank_account_number, '123-4-56789-0'),
    bank_account_name = coalesce(bank_account_name, 'อู่วาลิดการช่าง'),
    updated_at = now()
where deleted_at is null;

do $$
declare
  v_admin_id uuid;
begin
  select id into v_admin_id
  from auth.users
  where email = 'admin@walidgarage.local'
  limit 1;

  if v_admin_id is null then
    v_admin_id := '00000000-0000-0000-0000-000000000001';

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'admin@walidgarage.local',
      crypt('Admin1234!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"ผู้ดูแลระบบ","role":"owner"}',
      now(),
      now()
    );
  end if;

  update auth.users
  set encrypted_password = crypt('Admin1234!', gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_app_meta_data = '{"provider":"email","providers":["email"]}',
      raw_user_meta_data = '{"full_name":"ผู้ดูแลระบบ","role":"owner"}',
      updated_at = now()
  where id = v_admin_id;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    v_admin_id,
    v_admin_id,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@walidgarage.local'),
    'email',
    'admin@walidgarage.local',
    now(),
    now(),
    now()
  ) on conflict (provider, provider_id) do nothing;

  insert into public.profiles (id, email, full_name, role, is_active)
  values (v_admin_id, 'admin@walidgarage.local', 'ผู้ดูแลระบบ', 'owner', true)
  on conflict (id) do update
  set role = 'owner',
      full_name = excluded.full_name,
      is_active = true,
      updated_at = now();
end $$;

insert into public.repair_job_items (repair_job_id, title, description, labor_price, quantity, discount)
select r.id, 'ยกเกียร์และเปลี่ยนคลัทช์', 'ถอดประกอบเกียร์ ตรวจเช็กชุดคลัทช์ และประกอบกลับ', 3000, 1, 0
from public.repair_jobs r
where r.job_number = 'JOB202605-00001'
  and not exists (select 1 from public.repair_job_items i where i.repair_job_id = r.id);

insert into public.repair_job_items (repair_job_id, title, description, labor_price, quantity, discount)
select r.id, 'อะไหล่: ชุดคลัทช์ Vigo', 'CL-001 เบิกใช้ 1 ชุด', 4500, 1, 500
from public.repair_jobs r
where r.job_number = 'JOB202605-00001'
  and exists (select 1 from public.repair_job_items i where i.repair_job_id = r.id)
  and not exists (
    select 1 from public.repair_job_items i
    where i.repair_job_id = r.id and i.title = 'อะไหล่: ชุดคลัทช์ Vigo'
  );

insert into public.repair_job_items (repair_job_id, title, description, labor_price, quantity, discount)
select r.id, 'อะไหล่: ลูกปืนคลัทช์', 'BR-010 เบิกใช้ 1 ชิ้น', 950, 1, 0
from public.repair_jobs r
where r.job_number = 'JOB202605-00001'
  and not exists (
    select 1 from public.repair_job_items i
    where i.repair_job_id = r.id and i.title = 'อะไหล่: ลูกปืนคลัทช์'
  );

update public.repair_jobs r
set estimated_total = coalesce((
  select sum(i.total)
  from public.repair_job_items i
  where i.repair_job_id = r.id and i.deleted_at is null
), 0)
where r.job_number = 'JOB202605-00001';

do $$
declare
  admin_id uuid;
  c1 uuid := gen_random_uuid();
  c2 uuid := gen_random_uuid();
  v1 uuid := gen_random_uuid();
  v2 uuid := gen_random_uuid();
  sup1 uuid := gen_random_uuid();
  cat1 uuid := gen_random_uuid();
  part1 uuid := gen_random_uuid();
  part2 uuid := gen_random_uuid();
  pur1 uuid := gen_random_uuid();
  job1 uuid := gen_random_uuid();
  quote1 uuid := gen_random_uuid();
  inv1 uuid := gen_random_uuid();
  rec1 uuid := gen_random_uuid();
  cash_bill1 uuid := gen_random_uuid();
  approval1 uuid := gen_random_uuid();
begin
  select id into admin_id
  from auth.users
  where email = 'admin@walidgarage.local'
  limit 1;

  if admin_id is null then
    raise exception 'Admin user was not created';
  end if;

  if exists (select 1 from public.customers where phone = '089-111-2222') then
    return;
  end if;

  insert into public.customers (id, full_name, phone, address, line_id, notes, outstanding_balance, created_by) values
    (c1, 'อับดุลเลาะห์ หะยี', '089-111-2222', 'อำเภอเมือง ขอนแก่น', 'abdullah.car', 'ลูกค้าประจำ', 8500, admin_id),
    (c2, 'สมชาย ใจดี', '086-333-4444', 'อำเภอบ้านไผ่ ขอนแก่น', 'somchai.auto', 'ชอบติดต่อผ่าน LINE', 0, admin_id);

  insert into public.vehicles (id, customer_id, license_plate, province, brand, model, year, color, mileage, vin, engine_no, created_by) values
    (v1, c1, 'กข 1234', 'ขอนแก่น', 'Toyota', 'Vigo', 2012, 'ขาว', 185200, 'VINTEST001', 'ENG001', admin_id),
    (v2, c2, 'บต 5678', 'ขอนแก่น', 'Honda', 'City', 2018, 'เทา', 82200, 'VINTEST002', 'ENG002', admin_id);

  insert into public.suppliers (id, name, phone, address, regular_items, credit_balance, notes) values
    (sup1, 'ร้านอะไหล่เมืองขอนแก่น', '043-111-222', 'ถนนมิตรภาพ ขอนแก่น', 'คลัทช์ ลูกปืน น้ำมันเครื่อง', 3250, 'เครดิต 30 วัน');

  insert into public.part_categories (id, name) values
    (cat1, 'ระบบส่งกำลัง');

  insert into public.parts (id, part_code, name, category_id, cost_price, sale_price, quantity_on_hand, unit, supplier_id, low_stock_threshold) values
    (part1, 'CL-001', 'ชุดคลัทช์ Vigo', cat1, 3200, 4500, 6, 'ชุด', sup1, 2),
    (part2, 'BR-010', 'ลูกปืนคลัทช์', cat1, 650, 950, 10, 'ชิ้น', sup1, 12);

  insert into public.purchases (
    id, supplier_id, purchase_no, purchased_at, subtotal, discount, total,
    paid_amount, balance_due, payment_status, notes, created_by
  ) values (
    pur1, sup1, 'PO202605-00001', current_date, 9650, 0, 9650,
    6400, 3250, 'partial', 'ตัวอย่างซื้ออะไหล่เข้าสต๊อกและค้างชำระบางส่วน', admin_id
  );

  insert into public.purchase_items (purchase_id, part_id, quantity, unit_cost) values
    (pur1, part1, 2, 3200),
    (pur1, part2, 5, 650);

  insert into public.repair_jobs (
    id, job_number, received_at, customer_id, vehicle_id, reported_problem, preliminary_check,
    intake_mileage, valuables, receiver_id, status, internal_notes, estimated_total, created_by
  ) values (
    job1, 'JOB202605-00001', current_date, c1, v1,
    'เข้าเกียร์ยาก คลัทช์ลื่นเวลาขึ้นเนิน',
    'ทดลองขับแล้วพบคลัทช์ลื่น มีเสียงลูกปืน',
    185200, 'ไม่มี', admin_id, 'quoted', 'รอลูกค้าอนุมัติเปลี่ยนชุดคลัทช์', 8500, admin_id
  );

  insert into public.quotations (
    id, quotation_no, issued_at, customer_id, vehicle_id, repair_job_id,
    subtotal, discount, total, notes, terms, status, created_by
  ) values (
    quote1, 'QT202605-00001', current_date, c1, v1, job1,
    9400, 900, 8500, 'ราคานี้รวมค่าแรงแล้ว', 'ใบเสนอราคามีผล 7 วัน', 'sent', admin_id
  );

  insert into public.quotation_items (quotation_id, item_type, part_id, description, quantity, unit_price, discount, total, sort_order) values
    (quote1, 'labor', null, 'ยกเกียร์และเปลี่ยนคลัทช์', 1, 3000, 0, 3000, 1),
    (quote1, 'part', part1, 'ชุดคลัทช์ Vigo', 1, 4500, 500, 4000, 2),
    (quote1, 'part', part2, 'ลูกปืนคลัทช์', 1, 950, 0, 950, 3),
    (quote1, 'other', null, 'น้ำมันเกียร์', 1, 950, 400, 550, 4);

  insert into public.invoices (
    id, invoice_no, quotation_id, issued_at, due_at, customer_id, vehicle_id, repair_job_id,
    subtotal, discount, total, paid_amount, balance_due, payment_status, notes, created_by
  ) values (
    inv1, 'INV202605-00001', quote1, current_date, current_date - interval '1 day', c1, v1, job1,
    9400, 900, 8500, 0, 8500, 'unpaid', 'รอชำระหลังซ่อมเสร็จ', admin_id
  );

  insert into public.invoice_items (invoice_id, item_type, part_id, description, quantity, unit_price, discount, total, sort_order)
  select inv1, item_type, part_id, description, quantity, unit_price, discount, total, sort_order
  from public.quotation_items where quotation_id = quote1;

  insert into public.receipts (
    id, receipt_no, received_at, customer_id, invoice_id, payment_method, amount, notes, created_by
  ) values (
    rec1, 'RC202605-00001', current_date, c1,
    inv1, 'cash', 1500, 'ตัวอย่างรับชำระบางส่วน', admin_id
  );

  insert into public.payment_records (invoice_id, receipt_id, paid_at, amount, payment_method, notes, created_by)
  values (inv1, rec1, current_date, 1500, 'cash', 'ชำระบางส่วน', admin_id);

  update public.invoices
  set paid_amount = 1500, balance_due = 7000, payment_status = 'partial'
  where id = inv1;

  insert into public.income_records (recorded_at, category, description, amount, payment_method, reference_no, receipt_id, created_by) values
    (current_date, 'repair_service', 'รับชำระบางส่วน INV202605-00001', 1500, 'cash', 'RC202605-00001', rec1, admin_id),
    (current_date - interval '3 days', 'parts_sale', 'ขายน้ำมันเครื่อง', 1200, 'transfer', null, null, admin_id);

  insert into public.cash_bills (
    id, cash_bill_no, issued_at, customer_id, vehicle_id,
    customer_name, customer_phone, customer_address, vehicle_text,
    subtotal, discount, total, payment_method, notes, created_by
  ) values (
    cash_bill1, 'CB202605-00001', current_date, c2, v2,
    'สมชาย ใจดี', '086-333-4444', 'อำเภอบ้านไผ่ ขอนแก่น', 'บต 5678 ขอนแก่น Honda City',
    1500, 0, 1500, 'transfer', 'บิลเงินสดตัวอย่างสำหรับงานด่วน', admin_id
  );

  insert into public.cash_bill_items (
    cash_bill_id, item_type, part_id, description, quantity, unit, unit_price, discount, total, sort_order
  ) values
    (cash_bill1, 'labor', null, 'ตรวจเช็กระบบเบรกด่วน', 1, 'รายการ', 800, 0, 800, 1),
    (cash_bill1, 'other', null, 'น้ำมันเบรก', 1, 'ขวด', 700, 0, 700, 2);

  insert into public.income_records (
    recorded_at, category, description, amount, payment_method, reference_no, cash_bill_id, created_by
  ) values (
    current_date, 'repair_service', 'บิลเงินสด CB202605-00001', 1500, 'transfer', 'CB202605-00001', cash_bill1, admin_id
  );

  insert into public.expense_records (recorded_at, category, description, amount, payment_method, supplier_id, created_by) values
    (current_date, 'parts_purchase', 'ซื้อชุดคลัทช์เข้าสต๊อก', 6400, 'transfer', sup1, admin_id),
    (current_date - interval '2 days', 'electricity', 'ค่าไฟเดือนล่าสุด', 2200, 'transfer', null, admin_id);

  insert into public.stock_movements (part_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by) values
    (part1, 'purchase', 2, 3200, 'purchase', pur1, 'รับเข้าจากใบซื้อ PO202605-00001', admin_id),
    (part2, 'purchase', 5, 650, 'purchase', pur1, 'รับเข้าจากใบซื้อ PO202605-00001', admin_id);

  insert into public.activity_logs (actor_id, action, table_name, record_id, metadata) values
    (admin_id, 'seed', 'repair_jobs', job1, '{"note":"created from seed flow"}');

  insert into public.approval_requests (
    id, request_type, action, target_table, target_id, target_label,
    reason, status, requested_by, metadata
  ) values (
    approval1, 'delete_document', 'soft_delete', 'quotations', quote1, 'QT202605-00001',
    'ตัวอย่างคำขออนุมัติเมื่อต้องการลบเอกสารที่ออกซ้ำ',
    'pending',
    admin_id,
    jsonb_build_object(
      'module_key', 'quotations',
      'module_title', 'ใบเสนอราคา',
      'amount', 8500,
      'current_status', 'sent',
      'requested_role', 'owner'
    )
  );

  insert into public.activity_logs (actor_id, action, table_name, record_id, metadata) values
    (admin_id, 'request_delete_approval', 'quotations', quote1, jsonb_build_object('approval_id', approval1));

  insert into public.document_counters(prefix, running_number)
  values ('PO', 1), ('CB', 1), ('BL', 0)
  on conflict (prefix) do update set running_number = greatest(public.document_counters.running_number, 1);

  update public.document_counters set running_number = 1 where prefix in ('JOB','QT','INV','RC','CB');
  update public.document_counters set running_number = greatest(running_number, 0) where prefix = 'BL';
end $$;

do $$
declare
  admin_id uuid;
  c2 uuid;
  v2 uuid;
  cash_bill1 uuid;
begin
  select id into admin_id
  from auth.users
  where email = 'admin@walidgarage.local'
  limit 1;

  select id into c2
  from public.customers
  where phone = '086-333-4444'
  order by created_at
  limit 1;

  if c2 is null then
    insert into public.customers (full_name, phone, address, line_id, notes, outstanding_balance, created_by)
    values ('สมชาย ใจดี', '086-333-4444', 'อำเภอบ้านไผ่ ขอนแก่น', 'somchai.auto', 'ลูกค้าบิลเงินสดตัวอย่าง', 0, admin_id)
    returning id into c2;
  end if;

  select id into v2
  from public.vehicles
  where customer_id = c2 and license_plate = 'บต 5678'
  order by created_at
  limit 1;

  if v2 is null then
    insert into public.vehicles (customer_id, license_plate, province, brand, model, year, color, mileage, created_by)
    values (c2, 'บต 5678', 'ขอนแก่น', 'Honda', 'City', 2018, 'เทา', 82200, admin_id)
    returning id into v2;
  end if;

  if not exists (select 1 from public.cash_bills where cash_bill_no = 'CB202605-00001') then
    cash_bill1 := gen_random_uuid();

    insert into public.cash_bills (
      id, cash_bill_no, issued_at, customer_id, vehicle_id,
      customer_name, customer_phone, customer_address, vehicle_text,
      subtotal, discount, total, payment_method, notes, created_by
    ) values (
      cash_bill1, 'CB202605-00001', current_date, c2, v2,
      'สมชาย ใจดี', '086-333-4444', 'อำเภอบ้านไผ่ ขอนแก่น', 'บต 5678 ขอนแก่น Honda City',
      1500, 0, 1500, 'transfer', 'บิลเงินสดตัวอย่างสำหรับงานด่วน', admin_id
    );

    insert into public.cash_bill_items (
      cash_bill_id, item_type, part_id, description, quantity, unit, unit_price, discount, total, sort_order
    ) values
      (cash_bill1, 'labor', null, 'ตรวจเช็กระบบเบรกด่วน', 1, 'รายการ', 800, 0, 800, 1),
      (cash_bill1, 'other', null, 'น้ำมันเบรก', 1, 'ขวด', 700, 0, 700, 2);

    insert into public.income_records (
      recorded_at, category, description, amount, payment_method, reference_no, cash_bill_id, created_by
    ) values (
      current_date, 'repair_service', 'บิลเงินสด CB202605-00001', 1500, 'transfer', 'CB202605-00001', cash_bill1, admin_id
    );

    insert into public.activity_logs (actor_id, action, table_name, record_id, metadata) values
      (admin_id, 'create_cash_bill', 'cash_bills', cash_bill1, jsonb_build_object('source', 'seed'));
  end if;

  insert into public.document_counters(prefix, running_number)
  values ('CB', 1), ('BL', 0)
  on conflict (prefix) do update set running_number = greatest(public.document_counters.running_number, 1);
end $$;

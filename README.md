# อู่วาลิดการช่าง

ระบบบริหารจัดการอู่ซ่อมรถยนต์แบบ Full-Stack สำหรับงานจริงในอู่: รับรถ เปิดงานซ่อม เสนอราคา วางบิล ออกใบเสร็จ ออกบิลเงินสด ตัดสต๊อก บันทึกรายรับรายจ่าย และดูรายงานบัญชีหลักโดยไม่รวมระบบภาษี/VAT/e-Tax

## Tech Stack

- Next.js App Router, React, TypeScript
- Tailwind CSS Responsive UI
- Supabase PostgreSQL, Supabase Auth, Row Level Security
- Server Actions และ Route Handlers
- Zod, React Hook Form, TanStack Table, Recharts
- pdfmake พร้อมฟอนต์ `NotoSansThai-Regular.ttf` สำหรับ PDF ภาษาไทย
- Deploy บน Vercel

## Module ที่มี

- Dashboard: รายได้วันนี้/เดือนนี้ รายจ่าย กำไร งานซ่อม ใบแจ้งหนี้ค้าง ลูกหนี้ และกราฟรายรับรายจ่าย
- Notifications: แจ้งเตือนอะไหล่ใกล้หมด/หมดสต๊อก ใบแจ้งหนี้ใกล้ครบกำหนด/เกินกำหนด และงานซ่อมที่รออะไหล่หรือรอชำระเงินนาน
- Approval Requests: ขออนุมัติการลบเอกสารสำคัญ เช่น ใบซื้อ ใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จ พร้อมเหตุผล ผู้ตรวจ และ Activity Log
- ลูกค้าและรถยนต์: CRUD, ค้นหา, soft delete
- งานซ่อม/ใบรับรถ: เลขงาน auto, สถานะงาน, อาการเสีย, ตรวจเช็ก, เลขไมล์, หมายเหตุ
- อะไหล่/สต๊อก: ราคาทุน ราคาขาย คงเหลือ Supplier จุดแจ้งเตือน และ stock movements
- ซื้ออะไหล่: บันทึกใบซื้อ รับสต๊อกเข้า สร้างรายจ่ายเมื่อจ่ายเงิน และติดตามเจ้าหนี้ Supplier
- Supplier/เจ้าหนี้
- ใบเสนอราคา: รายการค่าแรง/อะไหล่, approve, convert เป็นใบแจ้งหนี้
- ใบแจ้งหนี้: รับชำระบางส่วน/เต็มผ่านใบเสร็จ, คำนวณยอดค้าง
- ใบเสร็จรับเงิน: บันทึก payment record และ income record อัตโนมัติ
- บิลเงินสด: ออกบิลด่วนแบบไม่บังคับกรอกครบทุกช่อง, เลือกลูกค้า/รถ/งานซ่อมจากระบบหรือพิมพ์เอง, ตัดสต๊อกอะไหล่ และบันทึกรายรับอัตโนมัติ
- ตั้งค่าบัญชีรับเงินบนเอกสาร: ชื่อธนาคาร, โลโก้ธนาคาร, เลขบัญชี และชื่อบัญชีสำหรับแสดงบนเอกสาร/PDF
- ยกเลิก/กลับรายการเอกสาร: ใบเสร็จคืนยอดชำระและรายรับ, ใบแจ้งหนี้คืนสต๊อก, ใบซื้อกลับสต๊อกและเจ้าหนี้ พร้อมเหตุผลและ Activity Log
- รายรับ รายจ่าย และรายงานบัญชีพร้อม CSV export
- นำเข้า CSV สำหรับลูกค้า รถยนต์ และอะไหล่: ตรวจข้อมูลซ้ำ, ตรวจสิทธิ์, บันทึก Activity Log และตัด stock movement เริ่มต้นสำหรับอะไหล่
- Activity Log รวม: กรองตามช่วงวันที่ ผู้ใช้ module และ action พร้อม Export CSV
- Backup / Export / Restore สำหรับ Owner: สำรองข้อมูลทั้งระบบเป็น JSON, Export รายตารางเป็น CSV/JSON, Restore แบบ merge-only และดู E2E Flow Health จากข้อมูลจริง
- ตั้งค่ากิจการและจัดการผู้ใช้
- Production fallback: loading, not-found และ error boundary สำหรับ route หลัก

## ติดตั้ง Local

```bash
npm install
cp .env.example .env.local
npm run dev
```

เปิด `http://localhost:3000`

## ตั้งค่า Supabase

1. สร้าง Supabase project ใหม่
2. คัดลอกค่า Project URL และ anon key ไปใส่ใน `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
# SUPABASE_SERVICE_ROLE_KEY=optional-service-role-key-for-admin-tasks-only
# DATABASE_URL=optional-postgres-connection-string-for-local-smoke-tests
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` ใช้เฉพาะฝั่ง server สำหรับ Owner เชิญผู้ใช้ใหม่ผ่าน Supabase Auth ห้ามใส่ prefix `NEXT_PUBLIC_` และห้ามใช้ใน Client Component

`DATABASE_URL` ใช้สำหรับรัน `npm run smoke:e2e` ในเครื่องหรือ staging เท่านั้น ไม่ต้องตั้งเป็น public env และไม่จำเป็นต้องใช้บน client

3. รัน SQL ใน `supabase/migrations` ตามลำดับไฟล์ผ่าน Supabase SQL Editor หรือ Supabase CLI ให้ครบถึง `0012_cash_bills.sql`
4. รัน `supabase/seed.sql` เพื่อสร้างข้อมูลทดสอบ
5. ใน Supabase Auth settings ให้เปิด Email provider

ถ้าต้องการรัน SQL จากเครื่อง local ให้เพิ่ม `DATABASE_URL` ใน `.env.local` แล้วใช้คำสั่ง:

```bash
npm run db:apply:voids
npm run db:apply:notifications
npm run db:seed
npm run db:seed:smoke
npm run db:verify:voids
npm run db:verify:notifications
```

คำสั่งนี้อ่าน connection string จาก `.env.local` เท่านั้น และไม่พิมพ์ค่า connection string ออกมาใน terminal

## บัญชี Admin ทดสอบ

Seed สร้างบัญชีนี้สำหรับ Supabase local/SQL seed:

- Email: `admin@walidgarage.local`
- Password: `Admin1234!`
- Role: `owner`

ถ้า Supabase cloud ไม่อนุญาต insert เข้า `auth.users` ผ่าน SQL Editor ให้สร้าง user จาก Auth Dashboard แล้วอัปเดต profile:

```sql
update public.profiles
set role = 'owner', full_name = 'ผู้ดูแลระบบ', is_active = true
where email = 'your-email@example.com';
```

## Flow หลักที่รองรับ

1. รับรถเข้าซ่อม: เพิ่มลูกค้า > เพิ่มรถ > เปิดงานซ่อม > พิมพ์ใบรับรถ
2. เสนอราคา: เลือกงานซ่อม > เพิ่มค่าแรง/อะไหล่ > ออกใบเสนอราคา > อนุมัติ
3. ซ่อมและตัดสต๊อก: สร้างใบแจ้งหนี้ที่มี item ประเภทอะไหล่ ระบบตรวจสต๊อกและตัด stock movement
4. วางบิลและรับเงิน: Convert ใบเสนอราคาเป็นใบแจ้งหนี้ > ออกใบเสร็จ > บันทึกรายรับอัตโนมัติ หรือออกบิลเงินสดสำหรับงานด่วนพร้อมบันทึกรายรับทันที
5. รายจ่ายและกำไรขาดทุน: บันทึกรายจ่าย > ดูรายงานรายรับ รายจ่าย กำไรขาดทุน ลูกหนี้ และสต๊อก
6. ซื้ออะไหล่และเจ้าหนี้: เลือก Supplier > เพิ่มรายการอะไหล่ > บันทึกใบซื้อ > สต๊อกเพิ่มอัตโนมัติ > จ่ายชำระบางส่วน/ครบจำนวน
7. ขออนุมัติลบเอกสารสำคัญ: กดลบเอกสาร > ระบุเหตุผล > Owner ตรวจในหน้าอนุมัติ > ระบบ soft delete และบันทึก Activity Log
8. ยกเลิกเอกสารแบบกลับรายการ: ระบุเหตุผล > PostgreSQL RPC transaction บันทึก `voided_at/voided_by/void_reason` > ปรับยอดใบแจ้งหนี้/รายรับ/รายจ่าย/เจ้าหนี้/สต๊อกตามประเภทเอกสาร > บันทึก Activity Log

## Deploy บน Vercel

1. Push repository ไป GitHub
2. Import project ใน Vercel
3. เพิ่ม Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` สำหรับฟังก์ชันเชิญผู้ใช้ในหน้า `/users`
   - `NEXT_PUBLIC_APP_URL`
4. Build command: `npm run build`
5. Output ใช้ค่า default ของ Next.js

## คำสั่งสำคัญ

```bash
npm run dev
npm run lint
npm run build
npm run db:apply:voids
npm run db:apply:notifications
npm run db:seed
npm run db:seed:smoke
npm run db:verify:voids
npm run db:verify:notifications
npm run smoke:e2e
npm run format
```

## E2E Smoke Test

Run this after migration/seed or before deployment to verify the real database flow:

```bash
npm run smoke:e2e
```

The smoke test is read-only. It loads `.env.local` automatically and connects with `DATABASE_URL` first. If `DATABASE_URL` is not set, it uses `NEXT_PUBLIC_SUPABASE_URL` with `SUPABASE_SERVICE_ROLE_KEY`.

ถ้าฐานข้อมูลมีข้อมูลที่ถูก soft delete/void จากการทดลองหลายรอบ ให้รัน `npm run db:seed:smoke` เพื่อเติมชุดข้อมูล active สำหรับตรวจ flow โดยไม่ลบข้อมูลธุรกิจเดิม

ใช้ `npm run db:verify:voids` เพื่อลองเรียก RPC ยกเลิกใบเสร็จ ใบแจ้งหนี้ และใบซื้อกับชุดข้อมูล smoke ใน transaction ที่ `ROLLBACK` ท้ายคำสั่ง จึงไม่ทิ้งผลยกเลิกจริงในฐานข้อมูล

ใช้ `npm run db:verify:notifications` เพื่อเรียก `refresh_system_notifications()` กับผู้ใช้ active จริง ตรวจว่ามีแจ้งเตือนจากอะไหล่ใกล้หมด/หมดสต๊อก ใบแจ้งหนี้ใกล้ครบกำหนด/เกินกำหนด และงานซ่อมที่รออะไหล่หรือรอชำระเงินนาน พร้อมตรวจว่าแจ้งเตือนลิงก์ตรงไปยัง record ต้นทาง

It checks Auth/RBAC, settings, document counters, customers, vehicles, repair jobs, quotations, invoices, receipts, cash bills, payments, stock movements, purchases, approval requests, income/expense records, unique document numbers, and activity logs. `FAIL` exits with code `1`; `WARN` exits successfully but tells you which business flow should be completed in the seeded/staging data.

## Security

- ทุกหน้าหลักอยู่หลัง Supabase Auth
- ทุก Server Action ตรวจ role ก่อน mutation
- API สร้าง PDF ตรวจ session และ role
- RLS เปิดทุกตารางสำคัญใน Supabase
- Notifications ใช้ RLS ตาม role และบันทึกสถานะอ่านรายผู้ใช้ผ่าน `notification_reads`
- Approval Requests ใช้ RLS ให้ผู้ขอดูคำขอตัวเองได้ และ Owner เป็นผู้อนุมัติ/ปฏิเสธเท่านั้น
- Void/Cancel เอกสารสำคัญตรวจ role ทั้งฝั่ง Server Action และ PostgreSQL RPC, บังคับระบุเหตุผล, ทำงานแบบ transaction และไม่ลบประวัติธุรกรรมเดิม
- ข้อมูลสำคัญใช้ environment variables และไม่ hardcode service key ใน client
- Soft delete สำหรับข้อมูลธุรกิจหลัก
- Activity log สำหรับ mutation สำคัญ
- Restore ข้อมูลทำแบบ Owner-only, merge-only, preview ก่อนยืนยัน และข้ามข้อมูลผู้ใช้/RBAC/Activity Log เพื่อไม่กระทบ Supabase Auth

## ไฟล์สำคัญ

- `supabase/migrations`: schema, FK, index, trigger, RLS policy, document counter, storage policy, purchase workflow RPC, approval workflow, document void/reversal metadata, void/reversal transaction RPC และ real-data notification refresh RPC
- `supabase/seed.sql`: seed admin, ลูกค้า, รถ, อะไหล่, supplier, งานซ่อม, ใบซื้อ, เอกสาร, บิลเงินสด, บัญชีรับเงิน, รายรับรายจ่าย
- `supabase/seed_smoke.sql`: seed ซ่อมชุดข้อมูล active สำหรับรัน `npm run smoke:e2e` ใน staging/local
- `supabase/verify_void_rpc.sql`: ตรวจ RPC void/reversal transaction แบบ rollback
- `supabase/verify_notifications.sql`: ตรวจ RPC แจ้งเตือนจากข้อมูลจริงและ deep-link ไปยัง record ต้นทาง
- `src/app/actions`: auth, CRUD, workflow server actions
- `src/app/api/documents/[type]/[id]/route.ts`: PDF export
- `src/components/tables/entity-manager.tsx`: CRUD UI หลักพร้อม table/search/pagination/dialog

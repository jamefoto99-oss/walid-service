import {
  BarChart3,
  Car,
  CheckCircle2,
  ClipboardList,
  FileText,
  PackageCheck,
  ReceiptText,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";

const operatingFlow = [
  {
    step: "01",
    title: "รับลูกค้าและบันทึกข้อมูล",
    href: "/customers",
    owner: "Staff / Manager",
    icon: Users,
    actions: [
      "ค้นหาลูกค้าเดิมก่อนทุกครั้งด้วยชื่อหรือเบอร์โทร",
      "ถ้าเป็นลูกค้าใหม่ให้เพิ่มข้อมูลลูกค้าเท่าที่มี ข้อมูลที่ไม่ทราบสามารถเว้นว่างได้",
      "ตรวจยอดค้างชำระเดิมของลูกค้าก่อนรับงานใหม่",
    ],
    output: "ได้ประวัติลูกค้าที่พร้อมผูกกับรถและงานซ่อม",
  },
  {
    step: "02",
    title: "เพิ่มหรือเลือกข้อมูลรถ",
    href: "/vehicles",
    owner: "Staff / Manager",
    icon: Car,
    actions: [
      "ค้นหาทะเบียนรถก่อนเพิ่มรถใหม่",
      "กรอกทะเบียน จังหวัด ยี่ห้อ รุ่น ปี สี และเลขไมล์ตามข้อมูลที่มี",
      "ตรวจประวัติซ่อมของรถคันนั้นก่อนเปิดงาน เพื่อให้ช่างเห็นปัญหาเดิม",
    ],
    output: "ได้ข้อมูลรถที่เชื่อมกับลูกค้าและพร้อมเปิดใบรับรถ",
  },
  {
    step: "03",
    title: "เปิดใบรับรถและงานซ่อม",
    href: "/repair-jobs",
    owner: "Staff / Manager",
    icon: ClipboardList,
    actions: [
      "เลือกชื่อลูกค้าและทะเบียนรถจากช่องค้นหา",
      "บันทึกอาการเสียที่ลูกค้าแจ้ง รายการตรวจเช็กเบื้องต้น เลขไมล์ และของมีค่าในรถ",
      "แนบรูปภาพรถก่อนซ่อมเมื่อมี เพื่อเก็บหลักฐานสภาพรถ",
      "พิมพ์ใบรับรถให้ลูกค้าและอัปเดตสถานะงานตามความคืบหน้า",
    ],
    output: "ได้เลขที่งานซ่อมและ timeline สำหรับติดตามงานตั้งแต่รับรถจนส่งมอบ",
  },
  {
    step: "04",
    title: "ตรวจเช็กและออกใบเสนอราคา",
    href: "/quotations",
    owner: "Manager / Accountant",
    icon: FileText,
    actions: [
      "เลือกงานซ่อมที่ต้องการเสนอราคา",
      "เพิ่มรายการค่าแรง รายการอะไหล่ และส่วนลด โดยระบุหน่วยนับให้ตรงกับงานจริง",
      "พิมพ์หรือดาวน์โหลด PDF ส่งให้ลูกค้าพิจารณา",
      "เมื่ออนุมัติแล้วให้กดอนุมัติใบเสนอราคาและเปลี่ยนสถานะงานเป็นกำลังซ่อม",
    ],
    output: "ได้เอกสารเสนอราคาที่ใช้เป็นฐานสำหรับวางบิลหรือแปลงเป็นใบแจ้งหนี้",
  },
  {
    step: "05",
    title: "ซ่อมรถและควบคุมสต๊อกอะไหล่",
    href: "/parts",
    owner: "Manager / Staff",
    icon: PackageCheck,
    actions: [
      "ตรวจจำนวนอะไหล่คงเหลือก่อนเบิกใช้",
      "เมื่อใช้อะไหล่ในใบแจ้งหนี้หรือบิลเงินสด ระบบจะตัดสต๊อกและบันทึก stock movement",
      "ติดตามรายการใกล้หมดและวางแผนซื้อเพิ่มจาก Supplier",
      "อัปเดตสถานะงานซ่อม เช่น กำลังซ่อม รออะไหล่ ซ่อมเสร็จ หรือรอชำระเงิน",
    ],
    output: "สต๊อกตรงกับการใช้งานจริงและงานซ่อมมีสถานะล่าสุดให้ทุกฝ่ายเห็น",
  },
  {
    step: "06",
    title: "วางบิล รับชำระ และออกเอกสารรับเงิน",
    href: "/invoices",
    owner: "Accountant / Manager",
    icon: ReceiptText,
    actions: [
      "งานปกติให้แปลงใบเสนอราคาเป็นใบแจ้งหนี้ หรือสร้างใบแจ้งหนี้จากรายการซ่อม",
      "รับชำระบางส่วนหรือเต็มจำนวน ระบบจะคำนวณยอดค้างและสถานะชำระเงิน",
      "ออกใบเสร็จรับเงินเมื่อมีการรับเงินจากใบแจ้งหนี้",
      "งานด่วนให้ใช้เมนูบิลเงินสด กรอกข้อมูลเองหรือค้นหาข้อมูลเดิมในระบบได้",
    ],
    output: "รายรับถูกบันทึกอัตโนมัติ และมีเอกสารการเงินพร้อมพิมพ์หรือดาวน์โหลด PDF",
  },
  {
    step: "07",
    title: "บันทึกซื้ออะไหล่และรายจ่าย",
    href: "/purchases",
    owner: "Accountant / Manager",
    icon: ShoppingCart,
    actions: [
      "เลือก Supplier แล้วบันทึกใบซื้ออะไหล่พร้อมรายการสินค้า",
      "เมื่อรับอะไหล่เข้าระบบ สต๊อกจะเพิ่มตามจำนวนที่ซื้อ",
      "บันทึกการจ่ายชำระ Supplier และรายจ่ายอื่น เช่น ค่าแรง ค่าไฟ ค่าน้ำ ค่าเดินทาง",
      "ตรวจเจ้าหนี้คงค้างเพื่อวางแผนจ่ายชำระ",
    ],
    output: "ต้นทุนและค่าใช้จ่ายครบถ้วน ทำให้รายงานกำไรขาดทุนแม่นยำขึ้น",
  },
  {
    step: "08",
    title: "ตรวจรายงานและปิดงาน",
    href: "/reports",
    owner: "Owner / Manager / Accountant",
    icon: BarChart3,
    actions: [
      "ตรวจรายงานรายรับ รายจ่าย กำไรขาดทุน ยอดขาย ลูกหนี้ เจ้าหนี้ และสต๊อก",
      "กรองช่วงวันที่เพื่อสรุปผลรายวัน รายเดือน หรือช่วงเวลาที่ต้องการ",
      "ส่งออกรายงาน CSV เมื่อต้องการนำไปตรวจสอบต่อ",
      "เมื่อรับเงินครบและส่งมอบรถแล้ว ให้ปิดสถานะงานเป็นส่งมอบรถแล้ว",
    ],
    output: "เจ้าของเห็นภาพรวมกิจการและทีมงานรู้ว่างานใดเสร็จสมบูรณ์แล้ว",
  },
];

const quickGuides = [
  {
    title: "เอกสารที่ควรใช้ในแต่ละสถานการณ์",
    items: [
      "ใบรับรถ: ใช้ทุกครั้งเมื่อมีรถเข้าซ่อม",
      "ใบเสนอราคา: ใช้เมื่อต้องให้ลูกค้าอนุมัติก่อนซ่อม",
      "ใบแจ้งหนี้: ใช้เมื่องานมีการวางบิลหรือรับเงินภายหลัง",
      "ใบเสร็จรับเงิน: ใช้เมื่อรับเงินจากใบแจ้งหนี้",
      "บิลเงินสด: ใช้กับงานด่วน ขายอะไหล่ หรือรับเงินทันที",
    ],
  },
  {
    title: "กติกาการทำงานที่ควรรักษา",
    items: [
      "ค้นหาข้อมูลเดิมก่อนเพิ่มข้อมูลใหม่ เพื่อลดข้อมูลซ้ำโดยไม่จำเป็น",
      "อัปเดตสถานะงานซ่อมทุกครั้งที่งานเปลี่ยนขั้นตอน",
      "ตรวจสต๊อกก่อนรับงานที่ต้องใช้อะไหล่หลายรายการ",
      "เอกสารสำคัญที่ต้องลบหรือยกเลิกควรระบุเหตุผลให้ชัดเจน",
      "ตรวจรายงานรายรับรายจ่ายทุกสิ้นวันหรืออย่างน้อยทุกสิ้นสัปดาห์",
    ],
  },
  {
    title: "สิทธิ์ผู้ใช้งานโดยสรุป",
    items: [
      "Owner / Admin: จัดการทุกส่วน ตั้งค่าระบบ ผู้ใช้ รายงาน และเอกสารสำคัญ",
      "Manager: คุมงานซ่อม ออกเอกสาร ดูรายงานหลัก และดูรายรับรายจ่าย",
      "Staff: เพิ่มลูกค้า เพิ่มรถ เปิดงานซ่อม และอัปเดตสถานะงาน",
      "Accountant: จัดการเอกสารบัญชี รายรับ รายจ่าย และรายงานการเงิน",
    ],
  },
];

const adminChecklist = [
  "ตั้งค่าชื่อกิจการ ที่อยู่ เบอร์โทร LINE โลโก้ และข้อความท้ายเอกสาร",
  "ตั้งค่าข้อมูลบัญชีธนาคารสำหรับแสดงบนใบแจ้งหนี้ บิลเงินสด และเอกสารรับเงิน",
  "ตรวจ prefix และ running number ของ JOB, QT, INV, RC, PO และ CB ก่อนเริ่มใช้งานจริง",
  "สร้างผู้ใช้งานให้ตรงกับบทบาทจริงของแต่ละคน และปิดใช้งานบัญชีที่ไม่ใช้งานแล้ว",
  "สำรองข้อมูลหรือ export ข้อมูลสำคัญเป็นระยะ โดยเฉพาะก่อนแก้ไขข้อมูลจำนวนมาก",
];

export default function ManualPage() {
  return (
    <>
      <PageHeader
        title="คู่มือการใช้งานระบบ"
        description="แนวทางปฏิบัติงานมาตรฐานสำหรับอู่วาลิดการช่าง ตั้งแต่รับลูกค้า เปิดงานซ่อม ออกเอกสาร รับเงิน จนถึงตรวจรายงาน"
      />

      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-sm font-semibold text-primary">ภาพรวมการทำงานประจำวัน</p>
            <h2 className="mt-2 text-2xl font-semibold">เริ่มจากลูกค้าและรถ แล้วไหลไปสู่งานซ่อม เอกสารบัญชี และรายงาน</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
              ระบบนี้ออกแบบให้ทีมหน้าอู่ ช่าง ผู้จัดการ และบัญชีทำงานต่อกันเป็นลำดับเดียวกัน
              ข้อมูลที่บันทึกในขั้นแรกจะถูกนำไปใช้ต่อในเอกสารและรายงาน เพื่อลดการพิมพ์ซ้ำและลดข้อผิดพลาด
            </p>
          </div>
          <div className="border-l-4 border-primary/40 pl-4">
            <p className="text-sm font-semibold">ลำดับสั้นที่สุดที่ควรจำ</p>
            <ol className="mt-3 space-y-2 text-sm text-muted">
              <li>1. ลูกค้า</li>
              <li>2. รถยนต์</li>
              <li>3. งานซ่อม / ใบรับรถ</li>
              <li>4. ใบเสนอราคา หรือ บิลเงินสด</li>
              <li>5. ใบแจ้งหนี้ / ใบเสร็จรับเงิน</li>
              <li>6. รายรับ รายจ่าย และรายงาน</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-primary">Standard Operating Procedure</p>
            <h2 className="text-xl font-semibold">ขั้นตอนการทำงานหลัก</h2>
          </div>
          <p className="hidden text-sm text-muted md:block">ทำตามลำดับนี้เพื่อให้ข้อมูลครบตั้งแต่หน้าร้านถึงบัญชี</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {operatingFlow.map((flow) => {
            const Icon = flow.icon;
            return (
              <article key={flow.step} className="rounded-lg border border-border bg-surface p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-surface-soft px-2 py-1 text-xs font-bold text-muted">{flow.step}</span>
                      <span className="text-xs font-semibold text-muted">{flow.owner}</span>
                    </div>
                    <h3 className="mt-2 text-lg font-semibold">{flow.title}</h3>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
                      {flow.actions.map((action) => (
                        <li className="flex gap-2" key={action}>
                          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                      <p className="text-sm font-semibold text-foreground">{flow.output}</p>
                      <Link className="text-sm font-semibold text-primary hover:underline" href={flow.href}>
                        ไปที่เมนูนี้
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-3">
        {quickGuides.map((guide) => (
          <article className="rounded-lg border border-border bg-surface p-5 shadow-sm" key={guide.title}>
            <h2 className="text-lg font-semibold">{guide.title}</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
              {guide.items.map((item) => (
                <li className="border-l-2 border-primary/40 pl-3" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="mt-5 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">รายการตรวจสอบก่อนเปิดใช้งานจริง</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              ให้ Owner ตรวจรายการนี้ก่อนเริ่มใช้ระบบออนไลน์ และทบทวนอีกครั้งเมื่อมีการเปลี่ยนข้อมูลกิจการหรือทีมงาน
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {adminChecklist.map((item) => (
                <div className="border-l-2 border-amber-500/50 pl-3 text-sm leading-6" key={item}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-border bg-[#eef7f4] p-5 text-sm leading-7 text-[#1e3830]">
        <h2 className="text-lg font-semibold">หลักการใช้งานให้ข้อมูลตรงกันทั้งอู่</h2>
        <p className="mt-2">
          เมื่อมีงานซ่อมใหม่ ให้เริ่มจากค้นหาลูกค้าและรถก่อนเสมอ จากนั้นเปิดงานซ่อมและอัปเดตสถานะตามจริง
          หากมีการรับเงินทันทีให้ใช้บิลเงินสด หากต้องวางบิลให้ใช้ใบแจ้งหนี้และออกใบเสร็จเมื่อรับเงิน
          ทุกข้อมูลที่บันทึกจะส่งผลต่อรายงานรายรับ รายจ่าย กำไรขาดทุน ลูกหนี้ เจ้าหนี้ และสต๊อก
        </p>
      </section>
    </>
  );
}

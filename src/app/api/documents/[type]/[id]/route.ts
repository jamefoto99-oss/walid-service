import path from "node:path";
import { NextResponse } from "next/server";
import pdfMake from "pdfmake";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { financeRoles } from "@/lib/constants";
import { getSessionProfile } from "@/lib/auth";
import { getDocumentForPrint } from "@/lib/data";
import { formatCurrency, formatDate } from "@/lib/utils";

const labels: Record<string, string> = {
  "repair-job": "ใบรับรถ",
  quotations: "ใบเสนอราคา",
  invoices: "ใบแจ้งหนี้",
  receipts: "ใบเสร็จรับเงิน",
  "cash-bills": "บิลเงินสด",
};

let fontsLoaded = false;

function ensureFonts() {
  if (fontsLoaded) return;
  pdfMake.addFonts({
    NotoSansThai: {
      normal: path.join(process.cwd(), "public", "fonts", "NotoSansThai-Regular.ttf"),
      bold: path.join(process.cwd(), "public", "fonts", "NotoSansThai-Regular.ttf"),
      italics: path.join(process.cwd(), "public", "fonts", "NotoSansThai-Regular.ttf"),
      bolditalics: path.join(process.cwd(), "public", "fonts", "NotoSansThai-Regular.ttf"),
    },
  });
  fontsLoaded = true;
}

function docNo(type: string, document: Record<string, unknown>) {
  if (type === "repair-job") return document.job_number;
  if (type === "quotations") return document.quotation_no;
  if (type === "invoices") return document.invoice_no;
  if (type === "receipts") return document.receipt_no;
  if (type === "cash-bills") return document.cash_bill_no;
  return document.id;
}

function isCancelledDocument(document: Record<string, unknown>) {
  return Boolean(document.voided_at) || document.status === "cancelled" || document.payment_status === "cancelled";
}

function cancellationReason(document: Record<string, unknown>) {
  return String(document.void_reason ?? document.notes ?? "เอกสารถูกยกเลิกในระบบ");
}

function hasPaymentInfo(company: Record<string, unknown> | null) {
  return Boolean(company?.bank_name || company?.bank_account_number || company?.bank_account_name);
}

async function logoImageDataUrl(value: unknown) {
  if (!value) return null;
  const url = String(value);
  if (url.startsWith("data:image/")) return url;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "image/png";
    if (!contentType.startsWith("image/")) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const session = await getSessionProfile();
  if (session.setupRequired) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  if (!session.profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (type !== "repair-job" && !financeRoles.includes(session.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await getDocumentForPrint(type, id);
  if (!data) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  ensureFonts();

  const { document, company, customer, vehicle, items } = data;
  const cancelled = isCancelledDocument(document);
  const logoDataUrl = await logoImageDataUrl(company?.logo_url);
  const bankLogoDataUrl = await logoImageDataUrl(company?.bank_logo_url);
  const companyHeader: Content[] = [];
  if (logoDataUrl) companyHeader.push({ image: logoDataUrl, width: 64, margin: [0, 0, 0, 8] });
  companyHeader.push(
    { text: String(company?.company_name ?? "อู่วาลิดการช่าง"), style: "company" },
    { text: String(company?.address ?? "-"), color: "#555555" },
    { text: `โทร ${String(company?.phone ?? "-")} LINE ${String(company?.line_id ?? "-")}`, color: "#555555" },
  );
  const detailContent: Content[] =
    type === "repair-job"
      ? [
          { text: "อาการเสียที่ลูกค้าแจ้ง", bold: true, margin: [0, 10, 0, 4] },
          { text: String(document.reported_problem ?? "-") },
          { text: "รายการตรวจเช็กเบื้องต้น", bold: true, margin: [0, 10, 0, 4] },
          { text: String(document.preliminary_check ?? "-") },
          { text: "ของมีค่าในรถ", bold: true, margin: [0, 10, 0, 4] },
          { text: String(document.valuables ?? "-") },
        ]
      : [
          {
            table: {
              widths: ["*", 40, 40, 65, 65, 75],
              body: [
                ["รายการ", "จำนวน", "หน่วย", "ราคา", "ส่วนลด", "รวม"],
                ...items.map((item) => [
                  String(item.description ?? "-"),
                  String(item.quantity ?? 1),
                  String(item.unit ?? "ชิ้น"),
                  formatCurrency(item.unit_price),
                  formatCurrency(item.discount),
                  formatCurrency(item.total),
                ]),
              ],
            },
            layout: "lightHorizontalLines",
            margin: [0, 10, 0, 12],
          },
          {
            columns: [
              { text: "" },
              {
                width: 220,
                table: {
                  widths: ["*", 90],
                  body: [
                    ["ยอดรวม", formatCurrency(document.subtotal ?? document.amount)],
                    ["ส่วนลด", formatCurrency(document.discount)],
                    [
                      { text: "ยอดสุทธิ", bold: true },
                      { text: formatCurrency(document.total ?? document.amount), bold: true },
                    ],
                  ],
                },
                layout: "noBorders",
              },
            ],
          },
        ];
  const cancellationContent: Content[] = cancelled
    ? [
        {
          margin: [0, 16, 0, 8],
          table: {
            widths: ["*"],
            body: [
              [
                {
                  stack: [
                    { text: "ยกเลิก", fontSize: 28, bold: true, color: "#991b1b", alignment: "center" },
                    {
                      text: `เอกสารนี้ถูกยกเลิกแล้วเมื่อ ${formatDate(document.voided_at ?? document.updated_at ?? document.created_at)}`,
                      color: "#991b1b",
                      bold: true,
                      alignment: "center",
                      margin: [0, 2, 0, 0],
                    },
                    {
                      text: `เหตุผล: ${cancellationReason(document)}`,
                      color: "#7f1d1d",
                      alignment: "center",
                      margin: [0, 4, 0, 0],
                    },
                    {
                      text: "ห้ามใช้เอกสารฉบับนี้เป็นเอกสารเรียกเก็บเงินหรือรับชำระที่ยังมีผลอยู่",
                      color: "#7f1d1d",
                      alignment: "center",
                      margin: [0, 4, 0, 0],
                    },
                  ],
                  fillColor: "#fef2f2",
                },
              ],
            ],
          },
          layout: {
            hLineColor: () => "#b91c1c",
            vLineColor: () => "#b91c1c",
            hLineWidth: () => 1.5,
            vLineWidth: () => 1.5,
            paddingTop: () => 8,
            paddingBottom: () => 8,
            paddingLeft: () => 10,
            paddingRight: () => 10,
          },
        },
      ]
    : [];
  const paymentContent: Content[] =
    type !== "repair-job" && hasPaymentInfo(company)
      ? [
          {
            margin: [0, 16, 0, 0],
            table: {
              widths: [64, "*"],
              body: [
                [
                  bankLogoDataUrl
                    ? { image: bankLogoDataUrl, fit: [48, 48], alignment: "center", margin: [0, 4, 0, 0] }
                    : { text: "BANK", alignment: "center", bold: true, color: "#71717a", margin: [0, 18, 0, 0] },
                  {
                    stack: [
                      { text: "ช่องทางการชำระเงิน", bold: true, margin: [0, 0, 0, 4] },
                      { text: `ธนาคาร : ${String(company?.bank_name ?? "-")}` },
                      {
                        text: `เลขที่บัญชี : ${String(company?.bank_account_number ?? "-")}`,
                        color: "#b91c1c",
                        bold: true,
                        fontSize: 15,
                      },
                      {
                        text: `ชื่อบัญชี : ${String(company?.bank_account_name ?? "-")}`,
                        background: "#fef3c7",
                        bold: true,
                        margin: [0, 2, 0, 0],
                      },
                    ],
                  },
                ],
              ],
            },
            layout: {
              hLineColor: () => "#e4e4e7",
              vLineColor: () => "#e4e4e7",
              paddingTop: () => 8,
              paddingBottom: () => 8,
              paddingLeft: () => 8,
              paddingRight: () => 8,
            },
          },
        ]
      : [];

  const definition: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [36, 36, 36, 48],
    defaultStyle: {
      font: "NotoSansThai",
      fontSize: 10,
    },
    content: [
      {
        columns: [
          companyHeader,
          [
            { text: labels[type] ?? "เอกสาร", style: "title", alignment: "right" },
            { text: String(docNo(type, document)), alignment: "right" },
            { text: `วันที่ ${formatDate(document.issued_at ?? document.received_at ?? document.created_at)}`, alignment: "right" },
          ],
        ],
      },
      { canvas: [{ type: "line", x1: 0, y1: 12, x2: 523, y2: 12, lineWidth: 1, lineColor: "#d4d4d4" }] },
      ...cancellationContent,
      {
        margin: [0, 20, 0, 12],
        columns: [
          [
            { text: "ข้อมูลลูกค้า", bold: true },
            { text: String(customer?.full_name ?? "-") },
            { text: `โทร ${String(customer?.phone ?? "-")}` },
            { text: String(customer?.address ?? "") },
          ],
          [
            { text: "ข้อมูลรถ", bold: true },
            { text: `${String(vehicle?.license_plate ?? "-")} ${String(vehicle?.province ?? "")}` },
            { text: `${String(vehicle?.brand ?? "")} ${String(vehicle?.model ?? "")} ${String(vehicle?.color ?? "")}` },
            { text: `เลขไมล์ ${String(document.intake_mileage ?? vehicle?.mileage ?? "-")}` },
          ],
        ],
      },
      ...detailContent,
      ...paymentContent,
      { text: "หมายเหตุ", bold: true, margin: [0, 18, 0, 4] },
      { text: String(document.notes ?? company?.document_footer ?? "-") },
      {
        margin: [0, 70, 0, 0],
        columns: [
          { text: "____________________________\nผู้จ่ายเงิน", alignment: "center" },
          { text: "____________________________\nผู้รับเงิน", alignment: "center" },
        ],
      },
    ],
    styles: {
      company: { fontSize: 16, bold: true },
      title: { fontSize: 22, bold: true },
    },
  };

  const pdf = pdfMake.createPdf(definition);
  const buffer = await pdf.getBuffer();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${String(docNo(type, document))}.pdf"`,
    },
  });
}

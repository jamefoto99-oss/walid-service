import path from "node:path";
import { NextResponse } from "next/server";
import pdfMake from "pdfmake";
import type { Content, ContentTable, ContentText, TableLayout, TDocumentDefinitions } from "pdfmake/interfaces";
import { financeRoles } from "@/lib/constants";
import { getSessionProfile } from "@/lib/auth";
import { getDocumentForPrint } from "@/lib/data";
import { toNumber } from "@/lib/utils";

const labels: Record<string, string> = {
  "repair-job": "ใบรับรถ",
  quotations: "ใบเสนอราคา",
  invoices: "ใบแจ้งหนี้",
  receipts: "ใบเสร็จรับเงิน",
  "billing-statements": "ใบวางบิล",
  "cash-bills": "บิลเงินสด",
};

type SignatureDefinition = { label: string; date?: boolean };

let fontsLoaded = false;

function ensureFonts() {
  if (fontsLoaded) return;
  pdfMake.addFonts({
    Roboto: {
      normal: path.join(process.cwd(), "node_modules", "pdfmake", "fonts", "Roboto", "Roboto-Regular.ttf"),
      bold: path.join(process.cwd(), "node_modules", "pdfmake", "fonts", "Roboto", "Roboto-Medium.ttf"),
      italics: path.join(process.cwd(), "node_modules", "pdfmake", "fonts", "Roboto", "Roboto-Italic.ttf"),
      bolditalics: path.join(process.cwd(), "node_modules", "pdfmake", "fonts", "Roboto", "Roboto-MediumItalic.ttf"),
    },
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
  if (type === "billing-statements") return document.billing_statement_no;
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

function displayValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text && text !== "-" ? text : "";
}

function flagValue(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function signatureDefinitions(type: string): SignatureDefinition[] {
  if (type === "quotations") {
    return [
      { label: "ผู้อนุมัติซื้อ" },
      { label: "ผู้เสนอราคา" },
      { label: "ผู้จัดการ" },
    ];
  }
  if (type === "invoices") return [{ label: "ผู้อนุมัติ" }, { label: "ผู้รับใบแจ้งหนี้" }];
  if (type === "receipts") return [{ label: "ผู้จ่ายเงิน", date: true }, { label: "ผู้รับเงิน", date: true }];
  if (type === "billing-statements") return [{ label: "ผู้วางบิล", date: true }, { label: "ผู้รับวางบิล", date: true }];
  if (type === "cash-bills") return [{ label: "ผู้จ่ายเงิน" }, { label: "ผู้รับเงิน" }];
  return [{ label: "ลูกค้า" }, { label: "ผู้รับผิดชอบ" }];
}

function fontRuns(value: unknown): Content {
  const text = String(value ?? "-");
  const parts = text.match(/[\u0E00-\u0E7F]+|[^\u0E00-\u0E7F]+/g) ?? [text];
  return parts.map((part) => ({
    text: part,
    font: /[\u0E00-\u0E7F]/.test(part) ? "NotoSansThai" : "Roboto",
  })) as unknown as Content;
}

function pdfText(value: unknown, props: Partial<ContentText> = {}): ContentText {
  return { ...props, text: fontRuns(value) } as ContentText;
}

function formatPdfDate(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH-u-nu-latn", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatPdfCurrency(value: unknown) {
  const number = toNumber(value);
  return `${number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} บาท`;
}

function tableColumnCount(node: ContentTable) {
  return node.table.body[0]?.length ?? 0;
}

const boxLayout: TableLayout = {
  hLineColor: "#d4d4d8",
  vLineColor: "#d4d4d8",
  paddingTop: () => 8,
  paddingBottom: () => 8,
  paddingLeft: () => 8,
  paddingRight: () => 8,
};

const framedTableLayout: TableLayout = {
  hLineColor: "#d4d4d8",
  vLineColor: "#d4d4d8",
  hLineWidth: (index, node) =>
    index === 0 || index === 1 || index === node.table.body.length ? 1 : 0.5,
  vLineWidth: (index, node) => (index === 0 || index === tableColumnCount(node) ? 1 : 0),
  paddingTop: () => 8,
  paddingBottom: () => 8,
  paddingLeft: () => 6,
  paddingRight: () => 6,
};

const summaryTableLayout: TableLayout = {
  hLineColor: "#d4d4d8",
  vLineColor: "#d4d4d8",
  hLineWidth: (index, node) =>
    index === 0 || index === node.table.body.length || index === node.table.body.length - 1 ? 1 : 0,
  vLineWidth: (index, node) => (index === 0 || index === tableColumnCount(node) ? 1 : 0),
  paddingTop: () => 5,
  paddingBottom: () => 5,
  paddingLeft: () => 8,
  paddingRight: () => 8,
};

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
  const showPaymentInfo = type !== "repair-job" && flagValue(document.show_payment_info);
  const showPaidStamp = type !== "repair-job" && flagValue(document.show_paid_stamp);
  const signatures = signatureDefinitions(type);
  const logoDataUrl = await logoImageDataUrl(company?.logo_url);
  const bankLogoDataUrl = await logoImageDataUrl(company?.bank_logo_url);
  const companyName = displayValue(company?.company_name) || "อู่วาลิดการช่าง";
  const companyAddress = displayValue(company?.address);
  const companyContact = [
    displayValue(company?.phone) ? `โทร ${displayValue(company?.phone)}` : "",
    displayValue(company?.line_id) ? `LINE ${displayValue(company?.line_id)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const companyLines: Content[] = [
    pdfText(companyName, { style: "company" }),
    ...(companyAddress ? [pdfText(companyAddress, { color: "#555555" })] : []),
    ...(companyContact ? [pdfText(companyContact, { color: "#555555" })] : []),
  ];
  const companyHeader: Content = logoDataUrl
    ? {
        columns: [
          { image: logoDataUrl, width: 54, margin: [0, 0, 8, 0] },
          { width: "*", stack: companyLines },
        ],
        columnGap: 8,
      }
    : { stack: companyLines };
  const detailContent: Content[] =
    type === "repair-job"
      ? [
          { text: "อาการเสียที่ลูกค้าแจ้ง", bold: true, margin: [0, 10, 0, 4] },
          pdfText(document.reported_problem ?? "-"),
          { text: "รายการตรวจเช็กเบื้องต้น", bold: true, margin: [0, 10, 0, 4] },
          pdfText(document.preliminary_check ?? "-"),
          { text: "ของมีค่าในรถ", bold: true, margin: [0, 10, 0, 4] },
          pdfText(document.valuables ?? "-"),
        ]
      : type === "billing-statements"
        ? [
            {
              table: {
                widths: [24, "*", 58, 58, 66, 66, 66],
                body: [
                  [
                    pdfText("ลำดับ", { alignment: "center", bold: true }),
                    pdfText("ใบแจ้งหนี้", { bold: true }),
                    pdfText("วันที่ออก", { bold: true }),
                    pdfText("ครบกำหนด", { bold: true }),
                    pdfText("ยอดรวม", { alignment: "right", bold: true }),
                    pdfText("ชำระแล้ว", { alignment: "right", bold: true }),
                    pdfText("ยอดค้าง", { alignment: "right", bold: true }),
                  ],
                  ...items.map((item, index) => [
                    pdfText(index + 1, { alignment: "center", fontSize: 9 }),
                    pdfText(item.invoice_no ?? "-", { fontSize: 9 }),
                    pdfText(formatPdfDate(item.issued_at), { fontSize: 9 }),
                    pdfText(formatPdfDate(item.due_at), { fontSize: 9 }),
                    pdfText(formatPdfCurrency(item.total), { alignment: "right", fontSize: 9 }),
                    pdfText(formatPdfCurrency(item.paid_amount), { alignment: "right", fontSize: 9 }),
                    pdfText(formatPdfCurrency(item.balance_due), { bold: true, alignment: "right", fontSize: 9 }),
                  ]),
                ],
              },
              layout: framedTableLayout,
              margin: [0, 10, 0, 12],
            },
            {
              margin: [0, 12, 0, 0],
              columns: [
                { width: "*", text: "" },
                {
                  width: 220,
                  table: {
                    widths: ["*", 100],
                    body: [
                      [{ text: "ยอดรวมใบวางบิล", alignment: "right" }, pdfText(formatPdfCurrency(document.subtotal ?? document.total), { alignment: "right" })],
                      [
                        { text: "ยอดสุทธิ", bold: true, alignment: "right" },
                        pdfText(formatPdfCurrency(document.total), { bold: true, alignment: "right" }),
                      ],
                    ],
                  },
                  layout: summaryTableLayout,
                },
              ],
            },
          ]
      : [
          {
            table: {
              widths: [24, "*", 28, 32, 58, 58, 62],
              body: [
                [
                  pdfText("ลำดับ", { alignment: "center", bold: true }),
                  pdfText("รายการ", { bold: true }),
                  pdfText("จำนวน", { alignment: "right", bold: true }),
                  pdfText("หน่วย", { alignment: "right", bold: true }),
                  pdfText("ราคา", { alignment: "right", bold: true }),
                  pdfText("ส่วนลด", { alignment: "right", bold: true }),
                  pdfText("รวม", { alignment: "right", bold: true }),
                ],
                ...items.map((item, index) => [
                  pdfText(index + 1, { alignment: "center", fontSize: 9 }),
                  pdfText(item.description ?? "-", { fontSize: 9 }),
                  pdfText(item.quantity ?? 1, { alignment: "right", fontSize: 9 }),
                  pdfText(item.unit ?? "ชิ้น", { alignment: "right", fontSize: 9 }),
                  pdfText(formatPdfCurrency(item.unit_price), { alignment: "right", fontSize: 9 }),
                  pdfText(formatPdfCurrency(item.discount), { alignment: "right", fontSize: 9 }),
                  pdfText(formatPdfCurrency(item.total), { alignment: "right", fontSize: 9 }),
                ]),
              ],
            },
            layout: framedTableLayout,
            margin: [0, 10, 0, 12],
          },
          {
            margin: [0, 12, 0, 0],
            columns: [
              { width: "*", text: "" },
              {
                width: 220,
                table: {
                  widths: ["*", 100],
                  body: [
                    [{ text: "ยอดรวม", alignment: "right" }, pdfText(formatPdfCurrency(document.subtotal ?? document.amount), { alignment: "right" })],
                    [{ text: "ส่วนลด", alignment: "right" }, pdfText(formatPdfCurrency(document.discount), { alignment: "right" })],
                    [
                      { text: "ยอดสุทธิ", bold: true, alignment: "right" },
                      pdfText(formatPdfCurrency(document.total ?? document.amount), { bold: true, alignment: "right" }),
                    ],
                  ],
                },
                layout: summaryTableLayout,
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
                      text: fontRuns(`เอกสารนี้ถูกยกเลิกแล้วเมื่อ ${formatPdfDate(document.voided_at ?? document.updated_at ?? document.created_at)}`),
                      color: "#991b1b",
                      bold: true,
                      alignment: "center",
                      margin: [0, 2, 0, 0],
                    },
                    {
                      text: fontRuns(`เหตุผล: ${cancellationReason(document)}`),
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
    showPaymentInfo && hasPaymentInfo(company)
      ? [
          {
            margin: [0, 16, 0, 0],
            table: {
              widths: [64, "*"],
              body: [
                [
                  bankLogoDataUrl
                    ? { image: bankLogoDataUrl, fit: [48, 48], alignment: "center", margin: [0, 4, 0, 0] }
                    : { text: "BANK", font: "Roboto", alignment: "center", bold: true, color: "#71717a", margin: [0, 18, 0, 0] },
                  {
                    stack: [
                      { text: "ช่องทางการชำระเงิน", bold: true, margin: [0, 0, 0, 4] },
                      pdfText(`ธนาคาร : ${String(company?.bank_name ?? "-")}`),
                      {
                        text: fontRuns(`เลขที่บัญชี : ${String(company?.bank_account_number ?? "-")}`),
                        color: "#b91c1c",
                        bold: true,
                        fontSize: 15,
                      },
                      {
                        text: fontRuns(`ชื่อบัญชี : ${String(company?.bank_account_name ?? "-")}`),
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

  const customerLines: Content[] = [
    { text: "ข้อมูลลูกค้า", bold: true },
    pdfText(displayValue(customer?.full_name) || "-"),
    ...(displayValue(customer?.phone) ? [pdfText(`โทร ${displayValue(customer?.phone)}`)] : []),
    ...(displayValue(customer?.address) ? [pdfText(customer?.address)] : []),
  ];
  const vehicleIdentity = [displayValue(vehicle?.license_plate), displayValue(vehicle?.province)].filter(Boolean).join(" ");
  const vehicleDetail = [displayValue(vehicle?.brand), displayValue(vehicle?.model), displayValue(vehicle?.color)].filter(Boolean).join(" ");
  const mileage = displayValue(document.intake_mileage ?? vehicle?.mileage);
  const vehicleLines: Content[] = [
    ...(vehicleIdentity ? [pdfText(vehicleIdentity)] : []),
    ...(vehicleDetail ? [pdfText(vehicleDetail)] : []),
    ...(mileage ? [pdfText(`เลขไมล์ ${mileage}`)] : []),
  ];
  const infoBox = (stack: Content[]): Content => ({
    table: {
      widths: ["*"],
      body: [[{ stack, margin: [4, 2, 4, 2] }]],
    },
    layout: boxLayout,
  });
  const infoSection: Content = {
    margin: [0, 20, 0, 12],
    columnGap: 12,
    columns: vehicleLines.length
      ? [
          { width: "*", stack: [infoBox(customerLines)] },
          { width: "*", stack: [infoBox([{ text: "ข้อมูลรถ", bold: true }, ...vehicleLines])] },
        ]
      : [{ width: "*", stack: [infoBox(customerLines)] }],
  };
  const noteText = displayValue(document.notes);
  const noteContent: Content[] = noteText
    ? [
        { text: "หมายเหตุ", bold: true, margin: [0, 18, 0, 4] },
        pdfText(noteText),
      ]
    : [];
  const titleStack: Content[] = [
    { text: labels[type] ?? "เอกสาร", style: "title", alignment: "right" },
    pdfText(docNo(type, document), { alignment: "right" }),
    pdfText(`วันที่ ${formatPdfDate(document.issued_at ?? document.received_at ?? document.created_at)}`, { alignment: "right" }),
    ...(showPaidStamp
      ? [
          {
            margin: [0, 8, 0, 0],
            columns: [
              { width: "*", text: "" },
              {
                width: 78,
                table: {
                  widths: ["*"],
                  body: [[{ text: "จ่ายแล้ว", alignment: "center", bold: true, color: "#047857" }]],
                },
                layout: {
                  hLineColor: () => "#047857",
                  vLineColor: () => "#047857",
                  hLineWidth: () => 1.5,
                  vLineWidth: () => 1.5,
                  paddingTop: () => 4,
                  paddingBottom: () => 4,
                },
              },
            ],
          } as Content,
        ]
      : []),
  ];
  const signatureContent: Content = {
    margin: [0, 70, 0, 0],
    columnGap: 18,
    columns: signatures.map((signature) => ({
      width: "*",
      stack: [
        {
          canvas: [{ type: "line", x1: 12, y1: 0, x2: signatures.length === 3 ? 145 : 215, y2: 0, lineWidth: 1, lineColor: "#71717a" }],
          margin: [0, 0, 0, 6],
        },
        pdfText(signature.label, { alignment: "center" }),
        ...(signature.date
          ? [
              pdfText("วันที่ ........../........../..........", {
                alignment: "center",
                margin: [0, 10, 0, 0],
              }),
            ]
          : []),
      ],
    })),
  };

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
          { width: "*", stack: [companyHeader] },
          { width: 170, stack: titleStack },
        ],
      },
      { canvas: [{ type: "line", x1: 0, y1: 12, x2: 523, y2: 12, lineWidth: 1, lineColor: "#d4d4d4" }] },
      ...cancellationContent,
      infoSection,
      ...detailContent,
      ...paymentContent,
      ...noteContent,
      signatureContent,
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

import path from "node:path";
import { NextResponse } from "next/server";
import pdfMake from "pdfmake";
import type { Content, ContentText, TDocumentDefinitions } from "pdfmake/interfaces";
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
                widths: ["*", 64, 64, 72, 72, 72],
                body: [
                  ["ใบแจ้งหนี้", "วันที่ออก", "ครบกำหนด", "ยอดรวม", "ชำระแล้ว", "ยอดค้าง"],
                  ...items.map((item) => [
                    pdfText(item.invoice_no ?? "-"),
                    pdfText(formatPdfDate(item.issued_at)),
                    pdfText(formatPdfDate(item.due_at)),
                    pdfText(formatPdfCurrency(item.total)),
                    pdfText(formatPdfCurrency(item.paid_amount)),
                    pdfText(formatPdfCurrency(item.balance_due), { bold: true }),
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
                      ["ยอดรวมใบวางบิล", pdfText(formatPdfCurrency(document.subtotal ?? document.total))],
                      [
                        { text: "ยอดสุทธิ", bold: true },
                        pdfText(formatPdfCurrency(document.total), { bold: true }),
                      ],
                    ],
                  },
                  layout: "noBorders",
                },
              ],
            },
          ]
      : [
          {
            table: {
              widths: ["*", 40, 40, 65, 65, 75],
              body: [
                ["รายการ", "จำนวน", "หน่วย", "ราคา", "ส่วนลด", "รวม"],
                ...items.map((item) => [
                  pdfText(item.description ?? "-"),
                  pdfText(item.quantity ?? 1),
                  pdfText(item.unit ?? "ชิ้น"),
                  pdfText(formatPdfCurrency(item.unit_price)),
                  pdfText(formatPdfCurrency(item.discount)),
                  pdfText(formatPdfCurrency(item.total)),
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
                    ["ยอดรวม", pdfText(formatPdfCurrency(document.subtotal ?? document.amount))],
                    ["ส่วนลด", pdfText(formatPdfCurrency(document.discount))],
                    [
                      { text: "ยอดสุทธิ", bold: true },
                      pdfText(formatPdfCurrency(document.total ?? document.amount), { bold: true }),
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
  const infoColumns: Content[] = vehicleLines.length
    ? [{ stack: customerLines }, { stack: [{ text: "ข้อมูลรถ", bold: true }, ...vehicleLines] }]
    : [{ stack: customerLines }];
  const noteText = displayValue(document.notes);
  const noteContent: Content[] = noteText
    ? [
        { text: "หมายเหตุ", bold: true, margin: [0, 18, 0, 4] },
        pdfText(noteText),
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
            pdfText(docNo(type, document), { alignment: "right" }),
            pdfText(`วันที่ ${formatPdfDate(document.issued_at ?? document.received_at ?? document.created_at)}`, { alignment: "right" }),
          ],
        ],
      },
      { canvas: [{ type: "line", x1: 0, y1: 12, x2: 523, y2: 12, lineWidth: 1, lineColor: "#d4d4d4" }] },
      ...cancellationContent,
      {
        margin: [0, 20, 0, 12],
        columns: infoColumns,
      },
      ...detailContent,
      ...paymentContent,
      ...noteContent,
      {
        margin: [0, 70, 0, 0],
        columns: [
          {
            width: "*",
            stack: [
              {
                canvas: [{ type: "line", x1: 36, y1: 0, x2: 226, y2: 0, lineWidth: 1, lineColor: "#71717a" }],
                margin: [0, 0, 0, 6],
              },
              pdfText("ผู้จ่ายเงิน", { alignment: "center" }),
            ],
          },
          {
            width: "*",
            stack: [
              {
                canvas: [{ type: "line", x1: 36, y1: 0, x2: 226, y2: 0, lineWidth: 1, lineColor: "#71717a" }],
                margin: [0, 0, 0, 6],
              },
              pdfText("ผู้รับเงิน", { alignment: "center" }),
            ],
          },
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

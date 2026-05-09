import { z } from "zod";
import { modules } from "./constants";
import type { FieldConfig, LineItemInput, ModuleConfig, RecordInput } from "./types";
import { compactObject } from "./utils";

const today = () => new Date().toISOString().slice(0, 10);

const uuidOrEmpty = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value));

export const lineItemSchema = z.object({
  item_type: z.enum(["labor", "part", "other"]),
  description: z
    .string()
    .trim()
    .transform((value) => value || "รายการ"),
  quantity: z.coerce.number().min(0.01, "จำนวนต้องมากกว่า 0"),
  unit_price: z.coerce.number().min(0, "ราคาต้องไม่ติดลบ"),
  discount: z.coerce.number().min(0, "ส่วนลดต้องไม่ติดลบ").default(0),
  part_id: z.string().optional().nullable(),
});

export const receiptPaymentSchema = z.object({
  invoice_id: z.string().min(1, "กรุณาเลือกใบแจ้งหนี้"),
  customer_id: z.string().min(1, "กรุณาเลือกลูกค้า"),
  received_at: z.string().min(1, "กรุณาระบุวันที่รับเงิน"),
  payment_method: z.string().min(1, "กรุณาเลือกช่องทางชำระเงิน"),
  amount: z.coerce.number().min(0.01, "จำนวนเงินต้องมากกว่า 0"),
  notes: z.string().optional().nullable(),
});

function schemaForField(field: FieldConfig) {
  let schema: z.ZodTypeAny;

  if (field.type === "number") {
    let numberSchema = z.coerce.number({ error: "ต้องเป็นตัวเลข" });
    if (field.min !== undefined) numberSchema = numberSchema.min(field.min);
    schema = z.preprocess(
      (value) => (value === "" || value === null || value === undefined ? 0 : value),
      numberSchema,
    );
  } else if (field.type === "date") {
    schema = z
      .string()
      .trim()
      .transform((value) => value || today());
  } else if (field.type === "line-items") {
    schema = z.preprocess((value) => {
      if (typeof value !== "string") return value;
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }, z.array(lineItemSchema).default([]));
  } else if (field.type === "select") {
    if (field.options?.length && !field.optionsKey) {
      schema = z
        .string()
        .trim()
        .transform((value) => value || field.options?.[0]?.value || "");
    } else {
      schema = field.required ? z.string().min(1, "กรุณาเลือกข้อมูล") : uuidOrEmpty;
    }
  } else {
    schema = z.string().trim().optional().nullable();
  }

  return field.required && field.type === "select" && field.optionsKey ? schema : schema.optional().nullable();
}

function textFallback(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function codeFallback(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function applyCreateDefaults(moduleKey: string, payload: Partial<RecordInput>) {
  if (moduleKey === "customers") {
    payload.full_name = textFallback(payload.full_name, "ไม่ระบุชื่อ");
    payload.phone = textFallback(payload.phone, "-");
  }

  if (moduleKey === "vehicles") {
    payload.license_plate = textFallback(payload.license_plate, codeFallback("CAR"));
    payload.brand = textFallback(payload.brand, "ไม่ระบุ");
    payload.model = textFallback(payload.model, "ไม่ระบุ");
  }

  if (moduleKey === "repair-jobs") {
    payload.reported_problem = textFallback(payload.reported_problem, "ไม่ระบุอาการ");
  }

  if (moduleKey === "parts") {
    payload.part_code = textFallback(payload.part_code, codeFallback("PART"));
    payload.name = textFallback(payload.name, String(payload.part_code));
    payload.unit = textFallback(payload.unit, "ชิ้น");
  }

  if (moduleKey === "suppliers") {
    payload.name = textFallback(payload.name, "ไม่ระบุ Supplier");
  }

  if (moduleKey === "income" || moduleKey === "expenses") {
    payload.category = textFallback(payload.category, "other");
    payload.description = textFallback(payload.description, "ไม่ระบุรายละเอียด");
    payload.payment_method = textFallback(payload.payment_method, "cash");
  }

  if (moduleKey === "settings") {
    payload.company_name = textFallback(payload.company_name, "อู่วาลิดการช่าง");
    payload.quotation_prefix = textFallback(payload.quotation_prefix, "QT");
    payload.invoice_prefix = textFallback(payload.invoice_prefix, "INV");
    payload.receipt_prefix = textFallback(payload.receipt_prefix, "RC");
    payload.repair_job_prefix = textFallback(payload.repair_job_prefix, "JOB");
  }

  return payload;
}

export function buildModuleSchema(config: ModuleConfig) {
  const shape = Object.fromEntries(config.fields.map((field) => [field.name, schemaForField(field)]));
  return z.object(shape);
}

export function validateModuleInput(moduleKey: string, input: RecordInput, options?: { applyDefaults?: boolean }) {
  const config = modules[moduleKey];
  if (!config) throw new Error("Unknown module");
  const schema = buildModuleSchema(config);
  const payload = compactObject(schema.parse(input) as RecordInput);
  return options?.applyDefaults ? applyCreateDefaults(moduleKey, payload) : payload;
}

export function parseLineItems(input: unknown): LineItemInput[] {
  if (Array.isArray(input)) return z.array(lineItemSchema).parse(input);
  if (typeof input === "string") {
    return z.array(lineItemSchema).parse(JSON.parse(input));
  }
  return [];
}

export function sumLineItems(items: LineItemInput[], discount = 0) {
  const subtotal = items.reduce((sum, item) => {
    return sum + item.quantity * item.unit_price - item.discount;
  }, 0);
  const total = Math.max(subtotal - Number(discount || 0), 0);
  return { subtotal, total };
}

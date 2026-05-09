"use server";

import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult, ModuleKey, Profile } from "@/lib/types";

type CsvImportModuleKey = Extract<ModuleKey, "customers" | "vehicles" | "parts">;
type CsvRow = {
  line: number;
  values: Map<string, string>;
};

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

const importableModules = new Set<CsvImportModuleKey>(["customers", "vehicles", "parts"]);
const maxRows = 1000;
const maxFileSize = 5 * 1024 * 1024;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const aliases = {
  fullName: ["full_name", "name", "customer_name", "ชื่อลูกค้า", "ชื่อ"],
  phone: ["phone", "tel", "mobile", "เบอร์โทร", "โทรศัพท์"],
  address: ["address", "ที่อยู่"],
  lineId: ["line_id", "line", "line_contact", "ไลน์", "line / ช่องทางติดต่อ"],
  notes: ["notes", "note", "remark", "หมายเหตุ"],
  customerId: ["customer_id", "id ลูกค้า"],
  customerPhone: ["customer_phone", "phone", "เบอร์ลูกค้า", "เบอร์โทรลูกค้า"],
  licensePlate: ["license_plate", "plate", "ทะเบียนรถ", "ทะเบียน"],
  province: ["province", "จังหวัดทะเบียน", "จังหวัด"],
  brand: ["brand", "make", "ยี่ห้อ"],
  model: ["model", "รุ่น"],
  year: ["year", "ปีรถ", "ปี"],
  color: ["color", "สี"],
  mileage: ["mileage", "เลขไมล์"],
  vin: ["vin", "เลขตัวถัง"],
  engineNo: ["engine_no", "engine_number", "เลขเครื่องยนต์"],
  partCode: ["part_code", "sku", "code", "รหัสอะไหล่", "รหัส"],
  partName: ["name", "part_name", "ชื่ออะไหล่", "ชื่อ"],
  categoryName: ["category_name", "category", "หมวดหมู่"],
  costPrice: ["cost_price", "cost", "ราคาทุน"],
  salePrice: ["sale_price", "price", "ราคาขาย"],
  quantityOnHand: ["quantity_on_hand", "quantity", "stock", "จำนวนคงเหลือ", "คงเหลือ"],
  unit: ["unit", "หน่วยนับ", "หน่วย"],
  supplierId: ["supplier_id", "id supplier"],
  supplierName: ["supplier_name", "supplier", "ชื่อ supplier", "ชื่อร้าน"],
  supplierPhone: ["supplier_phone", "เบอร์ supplier", "เบอร์ร้าน"],
  lowStockThreshold: ["low_stock_threshold", "reorder_point", "จุดแจ้งเตือน", "จุดเตือน"],
};

function isImportableModule(value: string): value is CsvImportModuleKey {
  return importableModules.has(value as CsvImportModuleKey);
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizePair(first: string, second: string) {
  return `${normalizeKey(first)}|${normalizeKey(second)}`;
}

function compact(value: unknown) {
  return String(value ?? "").trim();
}

function isBlankRow(row: string[]) {
  return row.every((cell) => !compact(cell));
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (!isBlankRow(row)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (inQuotes) throw new Error("CSV มีเครื่องหมาย quote ไม่ครบคู่");

  row.push(cell);
  if (!isBlankRow(row)) rows.push(row);
  return rows;
}

function csvToRows(content: string) {
  const parsedRows = parseCsv(content);
  if (parsedRows.length < 2) throw new Error("CSV ต้องมี header และข้อมูลอย่างน้อย 1 แถว");

  const headers = parsedRows[0].map(normalizeHeader);
  const duplicateHeaders = findDuplicates(headers.filter(Boolean));
  if (duplicateHeaders.length) throw new Error(`Header ซ้ำ: ${duplicateHeaders.join(", ")}`);

  const rows = parsedRows.slice(1).map((cells, index) => ({
    line: index + 2,
    values: new Map(headers.map((header, cellIndex) => [header, compact(cells[cellIndex])])),
  }));

  if (rows.length > maxRows) throw new Error(`นำเข้าได้สูงสุด ${maxRows.toLocaleString("th-TH")} แถวต่อไฟล์`);
  return rows;
}

function cell(row: CsvRow, fieldAliases: string[]) {
  for (const fieldAlias of fieldAliases) {
    const value = row.values.get(normalizeHeader(fieldAlias));
    if (value) return value;
  }
  return "";
}

function optionalText(value: string) {
  return value ? value : null;
}

function parseRequiredNumber(value: string, line: number, label: string, errors: string[]) {
  const normalized = value.replace(/,/g, "").trim();
  const number = Number(normalized);
  if (!normalized || !Number.isFinite(number) || number < 0) {
    errors.push(`แถว ${line}: ${label} ต้องเป็นตัวเลข 0 ขึ้นไป`);
    return 0;
  }
  return number;
}

function parseOptionalNumber(value: string, line: number, label: string, errors: string[], fallback: number | null) {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return fallback;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) {
    errors.push(`แถว ${line}: ${label} ต้องเป็นตัวเลข 0 ขึ้นไป`);
    return fallback;
  }
  return number;
}

function parseOptionalInteger(value: string, line: number, label: string, errors: string[]) {
  const number = parseOptionalNumber(value, line, label, errors, null);
  return number === null ? null : Math.round(number);
}

function requireValue(value: string, line: number, label: string, errors: string[]) {
  if (!value) errors.push(`แถว ${line}: กรุณาระบุ ${label}`);
  return value;
}

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  values.filter(Boolean).forEach((value) => {
    const key = normalizeKey(value);
    if (seen.has(key)) duplicates.add(value);
    seen.add(key);
  });

  return [...duplicates];
}

function collectErrors(errors: string[]) {
  if (!errors.length) return null;
  const visibleErrors = errors.slice(0, 10);
  const hiddenCount = errors.length - visibleErrors.length;
  return `${visibleErrors.join("\n")}${hiddenCount > 0 ? `\nและอีก ${hiddenCount.toLocaleString("th-TH")} รายการ` : ""}`;
}

async function logImportActivity(
  supabase: SupabaseClient,
  profile: Profile,
  tableName: string,
  fileName: string,
  importedCount: number,
) {
  await supabase.from("activity_logs").insert({
    actor_id: profile.id,
    action: "import_csv",
    table_name: tableName,
    record_id: null,
    metadata: {
      file_name: fileName,
      imported_count: importedCount,
    },
  });
}

function revalidateImportedModule(moduleKey: CsvImportModuleKey) {
  revalidatePath("/");
  revalidatePath(`/${moduleKey}`);
  if (moduleKey === "parts") {
    revalidatePath("/reports");
    revalidatePath("/notifications");
  }
}

async function importCustomers(supabase: SupabaseClient, profile: Profile, rows: CsvRow[], fileName: string) {
  const errors: string[] = [];
  const records = rows.map((row) => {
    const fullName = requireValue(cell(row, aliases.fullName), row.line, "ชื่อลูกค้า", errors);
    const phone = requireValue(cell(row, aliases.phone), row.line, "เบอร์โทร", errors);

    return {
      full_name: fullName,
      phone,
      address: optionalText(cell(row, aliases.address)),
      line_id: optionalText(cell(row, aliases.lineId)),
      notes: optionalText(cell(row, aliases.notes)),
      created_by: profile.id,
    };
  });

  findDuplicates(records.map((record) => record.phone)).forEach((phone) => {
    errors.push(`เบอร์โทรซ้ำในไฟล์: ${phone}`);
  });

  const phones = [...new Set(records.map((record) => record.phone).filter(Boolean))];
  if (phones.length) {
    const { data, error } = await supabase
      .from("customers")
      .select("phone,full_name")
      .in("phone", phones)
      .is("deleted_at", null);

    if (error) return { ok: false, error: error.message };
    (data ?? []).forEach((customer) => {
      errors.push(`พบลูกค้าเดิมในระบบ: ${customer.phone} (${customer.full_name ?? "-"})`);
    });
  }

  const errorText = collectErrors(errors);
  if (errorText) return { ok: false, error: errorText };

  const { error } = await supabase.from("customers").insert(records);
  if (error) return { ok: false, error: error.message };

  await logImportActivity(supabase, profile, "customers", fileName, records.length);
  revalidateImportedModule("customers");
  return { ok: true, message: `นำเข้าลูกค้า ${records.length.toLocaleString("th-TH")} รายการแล้ว` };
}

async function resolveCustomers(supabase: SupabaseClient, rows: CsvRow[], errors: string[]) {
  const customerIds = [...new Set(rows.map((row) => cell(row, aliases.customerId)).filter(Boolean))];
  const customerPhones = [...new Set(rows.map((row) => cell(row, aliases.customerPhone)).filter(Boolean))];
  const customerNames = [...new Set(rows.map((row) => cell(row, aliases.fullName)).filter(Boolean))];

  customerIds.forEach((id) => {
    if (!uuidPattern.test(id)) errors.push(`customer_id ไม่ถูกต้อง: ${id}`);
  });
  const validCustomerIds = customerIds.filter((id) => uuidPattern.test(id));

  const byId = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const byName = new Map<string, string>();

  if (validCustomerIds.length) {
    const { data, error } = await supabase
      .from("customers")
      .select("id,full_name,phone")
      .in("id", validCustomerIds)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((customer) => byId.set(String(customer.id), String(customer.id)));
  }

  if (customerPhones.length) {
    const { data, error } = await supabase
      .from("customers")
      .select("id,full_name,phone")
      .in("phone", customerPhones)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((customer) => {
      const key = normalizeKey(String(customer.phone ?? ""));
      if (byPhone.has(key)) errors.push(`พบลูกค้าเบอร์ ${customer.phone} มากกว่า 1 รายในระบบ`);
      byPhone.set(key, String(customer.id));
    });
  }

  if (customerNames.length) {
    const { data, error } = await supabase
      .from("customers")
      .select("id,full_name,phone")
      .in("full_name", customerNames)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((customer) => {
      const key = normalizeKey(String(customer.full_name ?? ""));
      if (byName.has(key)) errors.push(`พบลูกค้าชื่อ ${customer.full_name} มากกว่า 1 รายในระบบ`);
      byName.set(key, String(customer.id));
    });
  }

  return { byId, byPhone, byName };
}

async function importVehicles(supabase: SupabaseClient, profile: Profile, rows: CsvRow[], fileName: string) {
  const errors: string[] = [];
  const customerMaps = await resolveCustomers(supabase, rows, errors);
  const records = rows.map((row) => {
    const customerId = cell(row, aliases.customerId);
    const customerPhone = cell(row, aliases.customerPhone);
    const customerName = cell(row, aliases.fullName);
    const resolvedCustomerId =
      (customerId ? customerMaps.byId.get(customerId) : null) ??
      (customerPhone ? customerMaps.byPhone.get(normalizeKey(customerPhone)) : null) ??
      (customerName ? customerMaps.byName.get(normalizeKey(customerName)) : null);

    if (!resolvedCustomerId) {
      errors.push(`แถว ${row.line}: ไม่พบลูกค้า ให้ใส่ customer_id หรือ customer_phone ที่มีอยู่ในระบบ`);
    }

    const licensePlate = requireValue(cell(row, aliases.licensePlate), row.line, "ทะเบียนรถ", errors);
    const province = cell(row, aliases.province);
    const brand = requireValue(cell(row, aliases.brand), row.line, "ยี่ห้อ", errors);
    const model = requireValue(cell(row, aliases.model), row.line, "รุ่น", errors);

    return {
      customer_id: resolvedCustomerId ?? "",
      license_plate: licensePlate,
      province: optionalText(province),
      brand,
      model,
      year: parseOptionalInteger(cell(row, aliases.year), row.line, "ปีรถ", errors),
      color: optionalText(cell(row, aliases.color)),
      mileage: parseOptionalInteger(cell(row, aliases.mileage), row.line, "เลขไมล์", errors),
      vin: optionalText(cell(row, aliases.vin)),
      engine_no: optionalText(cell(row, aliases.engineNo)),
      notes: optionalText(cell(row, aliases.notes)),
      created_by: profile.id,
    };
  });

  findDuplicates(records.map((record) => normalizePair(record.license_plate, record.province ?? ""))).forEach((key) => {
    errors.push(`ทะเบียนซ้ำในไฟล์: ${key}`);
  });

  const plates = [...new Set(records.map((record) => record.license_plate).filter(Boolean))];
  if (plates.length) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("license_plate,province")
      .in("license_plate", plates);
    if (error) return { ok: false, error: error.message };

    const importedKeys = new Set(records.map((record) => normalizePair(record.license_plate, record.province ?? "")));
    (data ?? []).forEach((vehicle) => {
      const key = normalizePair(String(vehicle.license_plate ?? ""), String(vehicle.province ?? ""));
      if (importedKeys.has(key)) {
        errors.push(`พบรถเดิมในระบบ: ${vehicle.license_plate} ${vehicle.province ?? ""}`);
      }
    });
  }

  const errorText = collectErrors(errors);
  if (errorText) return { ok: false, error: errorText };

  const { error } = await supabase.from("vehicles").insert(records);
  if (error) return { ok: false, error: error.message };

  await logImportActivity(supabase, profile, "vehicles", fileName, records.length);
  revalidateImportedModule("vehicles");
  return { ok: true, message: `นำเข้ารถยนต์ ${records.length.toLocaleString("th-TH")} รายการแล้ว` };
}

async function resolvePartCategories(supabase: SupabaseClient, rows: CsvRow[]) {
  const categoryNames = [...new Set(rows.map((row) => cell(row, aliases.categoryName)).filter(Boolean))];
  if (!categoryNames.length) return new Map<string, string>();

  const { data: existing, error: existingError } = await supabase
    .from("part_categories")
    .select("id,name")
    .in("name", categoryNames);
  if (existingError) throw new Error(existingError.message);

  const existingNames = new Set((existing ?? []).map((category) => normalizeKey(String(category.name ?? ""))));
  const missingNames = categoryNames.filter((name) => !existingNames.has(normalizeKey(name)));
  if (missingNames.length) {
    const { error } = await supabase
      .from("part_categories")
      .upsert(missingNames.map((name) => ({ name })), { onConflict: "name", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  const { data, error } = await supabase
    .from("part_categories")
    .select("id,name")
    .in("name", categoryNames);
  if (error) throw new Error(error.message);

  return new Map((data ?? []).map((category) => [normalizeKey(String(category.name)), String(category.id)]));
}

async function resolveSuppliers(supabase: SupabaseClient, rows: CsvRow[], errors: string[]) {
  const supplierIds = [...new Set(rows.map((row) => cell(row, aliases.supplierId)).filter(Boolean))];
  const supplierPhones = [...new Set(rows.map((row) => cell(row, aliases.supplierPhone)).filter(Boolean))];
  const supplierNames = [...new Set(rows.map((row) => cell(row, aliases.supplierName)).filter(Boolean))];

  supplierIds.forEach((id) => {
    if (!uuidPattern.test(id)) errors.push(`supplier_id ไม่ถูกต้อง: ${id}`);
  });
  const validSupplierIds = supplierIds.filter((id) => uuidPattern.test(id));

  const byId = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const byName = new Map<string, string>();

  if (validSupplierIds.length) {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id,name,phone")
      .in("id", validSupplierIds)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((supplier) => byId.set(String(supplier.id), String(supplier.id)));
  }

  if (supplierPhones.length) {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id,name,phone")
      .in("phone", supplierPhones)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((supplier) => {
      const key = normalizeKey(String(supplier.phone ?? ""));
      if (byPhone.has(key)) errors.push(`พบ Supplier เบอร์ ${supplier.phone} มากกว่า 1 รายในระบบ`);
      byPhone.set(key, String(supplier.id));
    });
  }

  if (supplierNames.length) {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id,name,phone")
      .in("name", supplierNames)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((supplier) => {
      const key = normalizeKey(String(supplier.name ?? ""));
      if (byName.has(key)) errors.push(`พบ Supplier ชื่อ ${supplier.name} มากกว่า 1 รายในระบบ`);
      byName.set(key, String(supplier.id));
    });
  }

  return { byId, byPhone, byName };
}

async function importParts(supabase: SupabaseClient, profile: Profile, rows: CsvRow[], fileName: string) {
  const errors: string[] = [];
  const parsedRecords = rows.map((row) => {
    return {
      part_code: requireValue(cell(row, aliases.partCode), row.line, "รหัสอะไหล่", errors),
      name: requireValue(cell(row, aliases.partName), row.line, "ชื่ออะไหล่", errors),
      category_name: cell(row, aliases.categoryName),
      cost_price: parseRequiredNumber(cell(row, aliases.costPrice), row.line, "ราคาทุน", errors),
      sale_price: parseRequiredNumber(cell(row, aliases.salePrice), row.line, "ราคาขาย", errors),
      quantity_on_hand: parseRequiredNumber(cell(row, aliases.quantityOnHand), row.line, "จำนวนคงเหลือ", errors),
      unit: cell(row, aliases.unit) || "ชิ้น",
      supplier_id_input: cell(row, aliases.supplierId),
      supplier_phone: cell(row, aliases.supplierPhone),
      supplier_name: cell(row, aliases.supplierName),
      low_stock_threshold: parseOptionalNumber(cell(row, aliases.lowStockThreshold), row.line, "จุดแจ้งเตือน", errors, 1) ?? 1,
      notes: optionalText(cell(row, aliases.notes)),
      line: row.line,
    };
  });

  findDuplicates(parsedRecords.map((record) => record.part_code)).forEach((partCode) => {
    errors.push(`รหัสอะไหล่ซ้ำในไฟล์: ${partCode}`);
  });

  const partCodes = [...new Set(parsedRecords.map((record) => record.part_code).filter(Boolean))];
  if (partCodes.length) {
    const { data, error } = await supabase
      .from("parts")
      .select("part_code,name")
      .in("part_code", partCodes);
    if (error) return { ok: false, error: error.message };
    (data ?? []).forEach((part) => errors.push(`พบอะไหล่เดิมในระบบ: ${part.part_code} ${part.name ?? ""}`));
  }

  const suppliers = await resolveSuppliers(supabase, rows, errors);
  parsedRecords.forEach((record) => {
    const resolvedSupplierId =
      (record.supplier_id_input ? suppliers.byId.get(record.supplier_id_input) : null) ??
      (record.supplier_phone ? suppliers.byPhone.get(normalizeKey(record.supplier_phone)) : null) ??
      (record.supplier_name ? suppliers.byName.get(normalizeKey(record.supplier_name)) : null) ??
      null;

    if ((record.supplier_id_input || record.supplier_phone || record.supplier_name) && !resolvedSupplierId) {
      errors.push(`แถว ${record.line}: ไม่พบ Supplier ที่ระบุ`);
    }
  });

  const errorText = collectErrors(errors);
  if (errorText) return { ok: false, error: errorText };

  const categoriesByName = await resolvePartCategories(supabase, rows);
  const records = parsedRecords.map((record) => {
    const resolvedSupplierId =
      (record.supplier_id_input ? suppliers.byId.get(record.supplier_id_input) : null) ??
      (record.supplier_phone ? suppliers.byPhone.get(normalizeKey(record.supplier_phone)) : null) ??
      (record.supplier_name ? suppliers.byName.get(normalizeKey(record.supplier_name)) : null) ??
      null;

    const categoryId = record.category_name ? categoriesByName.get(normalizeKey(record.category_name)) ?? null : null;
    if (record.category_name && !categoryId) {
      throw new Error(`แถว ${record.line}: ไม่สามารถสร้าง/ค้นหาหมวดหมู่ ${record.category_name}`);
    }

    return {
      part_code: record.part_code,
      name: record.name,
      category_id: categoryId,
      cost_price: record.cost_price,
      sale_price: record.sale_price,
      quantity_on_hand: record.quantity_on_hand,
      unit: record.unit,
      supplier_id: resolvedSupplierId,
      low_stock_threshold: record.low_stock_threshold,
      notes: record.notes,
    };
  });

  const { data: insertedParts, error } = await supabase
    .from("parts")
    .insert(records)
    .select("id,part_code,quantity_on_hand,cost_price");
  if (error) return { ok: false, error: error.message };

  const stockMovements = (insertedParts ?? [])
    .filter((part) => Number(part.quantity_on_hand ?? 0) > 0)
    .map((part) => ({
      part_id: part.id,
      movement_type: "adjustment",
      quantity: Number(part.quantity_on_hand ?? 0),
      unit_cost: Number(part.cost_price ?? 0),
      reference_type: "csv_import",
      reference_id: null,
      notes: `นำเข้า CSV: ${fileName}`,
      created_by: profile.id,
    }));

  if (stockMovements.length) {
    const { error: movementError } = await supabase.from("stock_movements").insert(stockMovements);
    if (movementError) return { ok: false, error: movementError.message };
  }

  await logImportActivity(supabase, profile, "parts", fileName, records.length);
  revalidateImportedModule("parts");
  return { ok: true, message: `นำเข้าอะไหล่ ${records.length.toLocaleString("th-TH")} รายการแล้ว` };
}

export async function importCsvAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const moduleKey = String(formData.get("moduleKey") ?? "");
    if (!isImportableModule(moduleKey)) return { ok: false, error: "โมดูลนี้ยังไม่รองรับการนำเข้า CSV" };

    const session = await requireModuleAccess(moduleKey, "write");
    if (session.setupRequired) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };
    if (!session.profile) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "ยังไม่ได้ตั้งค่า Supabase" };

    const file = formData.get("file");
    if (!(file instanceof File) || file.size <= 0) return { ok: false, error: "กรุณาเลือกไฟล์ CSV" };
    if (file.size > maxFileSize) return { ok: false, error: "ไฟล์ CSV ต้องมีขนาดไม่เกิน 5MB" };

    const fileName = file.name || `${moduleKey}.csv`;
    if (!fileName.toLowerCase().endsWith(".csv")) return { ok: false, error: "รองรับเฉพาะไฟล์ .csv" };

    const rows = csvToRows(await file.text());

    if (moduleKey === "customers") return importCustomers(supabase, session.profile, rows, fileName);
    if (moduleKey === "vehicles") return importVehicles(supabase, session.profile, rows, fileName);
    return importParts(supabase, session.profile, rows, fileName);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "นำเข้า CSV ไม่สำเร็จ" };
  }
}

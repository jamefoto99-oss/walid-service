import type { createSupabaseServerClient } from "./supabase/server";
import { backupDatasets } from "./backup";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
type BackupRow = Record<string, unknown>;
type RestoreMode = "dry_run" | "restore";

type RestoreConfig = {
  key: string;
  table: string;
  label: string;
  keyColumn: string;
  stripColumns?: string[];
  mapActorColumns?: string[];
};

export type RestoreTableSummary = {
  key: string;
  table: string;
  label: string;
  incomingRows: number;
  existingRows: number;
  readyRows: number;
  insertedRows: number;
  skippedRows: number;
  status: "ready" | "restored" | "skipped" | "failed";
  message: string;
};

export type RestoreBackupResult = {
  mode: RestoreMode;
  exportedAt: string | null;
  formatVersion: number | null;
  totalIncomingRows: number;
  totalReadyRows: number;
  totalInsertedRows: number;
  summaries: RestoreTableSummary[];
  skippedDatasets: string[];
  warnings: string[];
  errors: string[];
};

const SKIPPED_DATASET_KEYS = new Set([
  "roles",
  "users",
  "profiles",
  "notifications",
  "notification_reads",
  "approval_requests",
  "activity_logs",
]);

const RESTORE_CONFIGS: RestoreConfig[] = [
  config("company_settings", "id"),
  config("document_counters", "prefix"),
  config("customers", "id", { mapActorColumns: ["created_by"] }),
  config("part_categories", "id"),
  config("suppliers", "id"),
  config("vehicles", "id", { mapActorColumns: ["created_by"] }),
  config("parts", "id"),
  config("repair_jobs", "id", { mapActorColumns: ["created_by", "receiver_id"] }),
  config("repair_job_items", "id", { stripColumns: ["total"] }),
  config("purchases", "id", { mapActorColumns: ["created_by"] }),
  config("purchase_items", "id", { stripColumns: ["total"] }),
  config("quotations", "id", { mapActorColumns: ["created_by"] }),
  config("quotation_items", "id"),
  config("invoices", "id", { mapActorColumns: ["created_by"] }),
  config("invoice_items", "id"),
  config("receipts", "id", { mapActorColumns: ["created_by"] }),
  config("billing_statements", "id", { mapActorColumns: ["created_by"] }),
  config("billing_statement_items", "id"),
  config("cash_bills", "id", { mapActorColumns: ["created_by"] }),
  config("cash_bill_items", "id"),
  config("income_records", "id", { mapActorColumns: ["created_by"] }),
  config("expense_records", "id", { mapActorColumns: ["created_by"] }),
  config("payment_records", "id", { mapActorColumns: ["created_by"] }),
  config("stock_movements", "id", { mapActorColumns: ["created_by"] }),
];

const RESTORE_CONFIG_BY_KEY = new Map<string, RestoreConfig>(RESTORE_CONFIGS.map((item) => [item.key, item]));
const DATASET_BY_KEY = new Map<string, (typeof backupDatasets)[number]>(
  backupDatasets.map((dataset) => [dataset.key, dataset]),
);

function config(
  key: string,
  keyColumn: string,
  options?: Pick<RestoreConfig, "stripColumns" | "mapActorColumns">,
): RestoreConfig {
  const dataset = backupDatasets.find((item) => item.key === key);
  if (!dataset) throw new Error(`Unknown backup dataset: ${key}`);
  return {
    key,
    table: dataset.table,
    label: dataset.label,
    keyColumn,
    stripColumns: options?.stripColumns,
    mapActorColumns: options?.mapActorColumns,
  };
}

function isRecord(value: unknown): value is BackupRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPayloadMetadata(payload: BackupRow) {
  const exportedAt = typeof payload.exported_at === "string" ? payload.exported_at : null;
  const formatVersion = typeof payload.format_version === "number" ? payload.format_version : null;
  return { exportedAt, formatVersion };
}

function getPayloadDatasets(payload: unknown) {
  if (!isRecord(payload)) {
    return { datasets: null, errors: ["ไฟล์ backup ต้องเป็น JSON object"] };
  }

  if (payload.format_version !== 1) {
    return { datasets: null, errors: ["รองรับ backup format_version = 1 เท่านั้น"] };
  }

  if (!isRecord(payload.datasets)) {
    return { datasets: null, errors: ["ไฟล์นี้ไม่ใช่ full backup JSON จากระบบ"] };
  }

  return { datasets: payload.datasets, errors: [] };
}

function getDatasetRows(
  datasets: BackupRow,
  restoreConfig: RestoreConfig,
  errors: string[],
  warnings: string[],
) {
  const dataset = datasets[restoreConfig.key];
  if (dataset === undefined) {
    warnings.push(`ไม่พบชุดข้อมูล ${restoreConfig.label} ในไฟล์ backup`);
    return [];
  }

  if (!isRecord(dataset)) {
    errors.push(`${restoreConfig.label}: รูปแบบ dataset ไม่ถูกต้อง`);
    return [];
  }

  if (dataset.table && dataset.table !== restoreConfig.table) {
    errors.push(`${restoreConfig.label}: table ไม่ตรงกับ schema ปัจจุบัน`);
    return [];
  }

  if (!Array.isArray(dataset.rows)) {
    errors.push(`${restoreConfig.label}: rows ต้องเป็น array`);
    return [];
  }

  if (typeof dataset.row_count === "number" && dataset.row_count !== dataset.rows.length) {
    warnings.push(`${restoreConfig.label}: row_count ไม่ตรงกับจำนวน rows จริง`);
  }

  return dataset.rows;
}

function sanitizeRow(
  row: unknown,
  restoreConfig: RestoreConfig,
  actorId: string,
  rowNumber: number,
  errors: string[],
) {
  if (!isRecord(row)) {
    errors.push(`${restoreConfig.label}: row ${rowNumber} ไม่ใช่ object`);
    return null;
  }

  const keyValue = row[restoreConfig.keyColumn];
  if (typeof keyValue !== "string" || !keyValue.trim()) {
    errors.push(`${restoreConfig.label}: row ${rowNumber} ไม่มี ${restoreConfig.keyColumn}`);
    return null;
  }

  const sanitized = { ...row };
  for (const column of restoreConfig.stripColumns ?? []) {
    delete sanitized[column];
  }
  for (const column of restoreConfig.mapActorColumns ?? []) {
    if (column in sanitized) sanitized[column] = actorId;
  }

  return sanitized;
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function findExistingKeys(
  supabase: SupabaseServerClient,
  restoreConfig: RestoreConfig,
  keyValues: string[],
) {
  const existingKeys = new Set<string>();
  const uniqueKeyValues = [...new Set(keyValues)];

  for (const keyChunk of chunk(uniqueKeyValues, 100)) {
    const { data, error } = await supabase
      .from(restoreConfig.table)
      .select(restoreConfig.keyColumn)
      .in(restoreConfig.keyColumn, keyChunk);

    if (error) throw new Error(`${restoreConfig.label}: ${error.message}`);

    for (const row of (data ?? []) as unknown as BackupRow[]) {
      const keyValue = row[restoreConfig.keyColumn];
      if (typeof keyValue === "string") existingKeys.add(keyValue);
    }
  }

  return existingKeys;
}

async function insertRows(
  supabase: SupabaseServerClient,
  restoreConfig: RestoreConfig,
  rows: BackupRow[],
) {
  let insertedRows = 0;

  for (const rowChunk of chunk(rows, 100)) {
    const { data, error } = await supabase
      .from(restoreConfig.table)
      .insert(rowChunk)
      .select(restoreConfig.keyColumn);

    if (error) throw new Error(`${restoreConfig.label}: ${error.message}`);
    insertedRows += data?.length ?? rowChunk.length;
  }

  return insertedRows;
}

function tableSummary(
  restoreConfig: RestoreConfig,
  incomingRows: number,
  existingRows: number,
  readyRows: number,
  insertedRows: number,
  mode: RestoreMode,
): RestoreTableSummary {
  const skippedRows = incomingRows - insertedRows;
  const status =
    mode === "restore" && insertedRows > 0
      ? "restored"
      : readyRows > 0
        ? "ready"
        : "skipped";

  return {
    key: restoreConfig.key,
    table: restoreConfig.table,
    label: restoreConfig.label,
    incomingRows,
    existingRows,
    readyRows,
    insertedRows,
    skippedRows,
    status,
    message:
      status === "skipped"
        ? "ไม่มีแถวใหม่สำหรับนำเข้า"
        : mode === "restore"
          ? `นำเข้าแล้ว ${insertedRows.toLocaleString("th-TH")} แถว`
          : `พร้อมนำเข้า ${readyRows.toLocaleString("th-TH")} แถว`,
  };
}

export async function restoreBackupPayload({
  actorId,
  mode,
  payload,
  supabase,
}: {
  actorId: string;
  mode: RestoreMode;
  payload: unknown;
  supabase: SupabaseServerClient;
}): Promise<RestoreBackupResult> {
  const metadata = isRecord(payload) ? readPayloadMetadata(payload) : { exportedAt: null, formatVersion: null };
  const warnings: string[] = [];
  const errors: string[] = [];
  const skippedDatasets: string[] = [];
  const summaries: RestoreTableSummary[] = [];
  let totalIncomingRows = 0;
  let totalReadyRows = 0;
  let totalInsertedRows = 0;

  const payloadDatasets = getPayloadDatasets(payload);
  errors.push(...payloadDatasets.errors);

  if (!payloadDatasets.datasets) {
    return {
      mode,
      ...metadata,
      totalIncomingRows,
      totalReadyRows,
      totalInsertedRows,
      summaries,
      skippedDatasets,
      warnings,
      errors,
    };
  }

  for (const key of Object.keys(payloadDatasets.datasets)) {
    if (SKIPPED_DATASET_KEYS.has(key)) skippedDatasets.push(key);
    if (!SKIPPED_DATASET_KEYS.has(key) && !RESTORE_CONFIG_BY_KEY.has(key) && !DATASET_BY_KEY.has(key)) {
      warnings.push(`พบ dataset ที่ระบบไม่รู้จักและจะไม่นำเข้า: ${key}`);
    }
  }

  for (const skippedKey of SKIPPED_DATASET_KEYS) {
    if (payloadDatasets.datasets[skippedKey] !== undefined) {
      const dataset = DATASET_BY_KEY.get(skippedKey);
      const reason = skippedKey.startsWith("notification")
        ? "ข้ามการนำเข้าเพราะระบบสร้างแจ้งเตือนใหม่จากข้อมูลจริงได้"
        : skippedKey === "approval_requests"
          ? "ข้ามการนำเข้าเพื่อไม่ย้อนสถานะคำขออนุมัติย้อนหลัง"
          : "ข้ามการนำเข้าเพื่อไม่แตะระบบผู้ใช้/RBAC/Activity Log";
      warnings.push(`${dataset?.label ?? skippedKey}: ${reason}`);
    }
  }

  const preparedTables = RESTORE_CONFIGS.map((restoreConfig) => {
    const rawRows = getDatasetRows(payloadDatasets.datasets!, restoreConfig, errors, warnings);
    const rows = rawRows
      .map((row, index) => sanitizeRow(row, restoreConfig, actorId, index + 1, errors))
      .filter((row): row is BackupRow => row !== null);

    return { restoreConfig, rows };
  });

  totalIncomingRows = preparedTables.reduce((sum, table) => sum + table.rows.length, 0);

  if (errors.length > 0) {
    return {
      mode,
      ...metadata,
      totalIncomingRows,
      totalReadyRows,
      totalInsertedRows,
      summaries,
      skippedDatasets,
      warnings,
      errors,
    };
  }

  if (totalIncomingRows === 0) {
    errors.push("ไม่พบข้อมูลที่นำเข้าได้ในไฟล์ backup");
    return {
      mode,
      ...metadata,
      totalIncomingRows,
      totalReadyRows,
      totalInsertedRows,
      summaries,
      skippedDatasets,
      warnings,
      errors,
    };
  }

  for (const { restoreConfig, rows } of preparedTables) {
    try {
      const seenKeys = new Set<string>();
      const uniqueRows: BackupRow[] = [];

      for (const row of rows) {
        const keyValue = String(row[restoreConfig.keyColumn]);
        if (seenKeys.has(keyValue)) continue;
        seenKeys.add(keyValue);
        uniqueRows.push(row);
      }

      const duplicateRows = rows.length - uniqueRows.length;
      if (duplicateRows > 0) {
        warnings.push(`${restoreConfig.label}: พบ key ซ้ำ ${duplicateRows.toLocaleString("th-TH")} แถวและจะใช้แถวแรก`);
      }

      const keyValues = uniqueRows.map((row) => String(row[restoreConfig.keyColumn]));
      const existingKeys = uniqueRows.length > 0 ? await findExistingKeys(supabase, restoreConfig, keyValues) : new Set<string>();
      const rowsToInsert = uniqueRows.filter((row) => !existingKeys.has(String(row[restoreConfig.keyColumn])));
      const insertedRows = mode === "restore" && rowsToInsert.length > 0
        ? await insertRows(supabase, restoreConfig, rowsToInsert)
        : 0;
      const summary = tableSummary(restoreConfig, rows.length, existingKeys.size, rowsToInsert.length, insertedRows, mode);

      summaries.push(summary);
      totalReadyRows += summary.readyRows;
      totalInsertedRows += insertedRows;
    } catch (error) {
      const message = error instanceof Error ? error.message : "restore failed";
      errors.push(message);
      summaries.push({
        key: restoreConfig.key,
        table: restoreConfig.table,
        label: restoreConfig.label,
        incomingRows: rows.length,
        existingRows: 0,
        readyRows: 0,
        insertedRows: 0,
        skippedRows: rows.length,
        status: "failed",
        message,
      });

      if (mode === "restore") break;
    }
  }

  return {
    mode,
    ...metadata,
    totalIncomingRows,
    totalReadyRows,
    totalInsertedRows,
    summaries,
    skippedDatasets,
    warnings,
    errors,
  };
}

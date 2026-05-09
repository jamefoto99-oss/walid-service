import { NextRequest } from "next/server";
import {
  backupDatasets,
  createBackupPayload,
  createCsv,
  fetchAllBackupRows,
  fetchBackupRows,
  getBackupDataset,
} from "@/lib/backup";
import { getSessionProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function downloadResponse(body: string, filename: string, contentType: string) {
  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-type": contentType,
    },
  });
}

function safeDate() {
  return new Date().toISOString().slice(0, 10);
}

async function logExport(
  dataset: string,
  format: string,
  rowCount: number,
  actorId: string,
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;

  await supabase.from("activity_logs").insert({
    actor_id: actorId,
    action: "export_backup",
    table_name: "backup_exports",
    record_id: null,
    metadata: {
      dataset,
      format,
      row_count: rowCount,
      exported_at: new Date().toISOString(),
    },
  });
}

export async function GET(request: NextRequest) {
  const session = await getSessionProfile();
  if (session.setupRequired) {
    return Response.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  if (!session.profile?.is_active) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.profile.role !== "owner") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const params = request.nextUrl.searchParams;
  const datasetKey = params.get("dataset") ?? "all";
  const format = params.get("format") ?? "csv";

  try {
    if (datasetKey === "all") {
      if (format !== "json") {
        return Response.json({ error: "Full backup supports JSON only" }, { status: 400 });
      }

      const rowsByKey = await fetchAllBackupRows(supabase);
      const payload = createBackupPayload(rowsByKey);
      const rowCount = backupDatasets.reduce(
        (sum, dataset) => sum + (rowsByKey[dataset.key]?.length ?? 0),
        0,
      );

      await logExport("all", "json", rowCount, session.profile.id);
      return downloadResponse(
        JSON.stringify(payload, null, 2),
        `walid-garage-backup-${safeDate()}.json`,
        "application/json; charset=utf-8",
      );
    }

    const dataset = getBackupDataset(datasetKey);
    if (!dataset) return Response.json({ error: "Unknown backup dataset" }, { status: 404 });
    if (!["csv", "json"].includes(format)) {
      return Response.json({ error: "Unsupported format" }, { status: 400 });
    }

    const rows = await fetchBackupRows(supabase, dataset);
    await logExport(dataset.key, format, rows.length, session.profile.id);

    if (format === "json") {
      return downloadResponse(
        JSON.stringify(
          {
            exported_at: new Date().toISOString(),
            dataset: dataset.key,
            table: dataset.table,
            label: dataset.label,
            row_count: rows.length,
            rows,
          },
          null,
          2,
        ),
        `walid-garage-${dataset.key}-${safeDate()}.json`,
        "application/json; charset=utf-8",
      );
    }

    return downloadResponse(
      `\uFEFF${createCsv(rows)}`,
      `walid-garage-${dataset.key}-${safeDate()}.csv`,
      "text/csv; charset=utf-8",
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 },
    );
  }
}

import { NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { restoreBackupPayload } from "@/lib/backup-restore";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RestoreRequestBody = {
  mode?: "dry_run" | "restore";
  payload?: unknown;
};

async function logRestoreAttempt({
  actorId,
  insertedRows,
  mode,
  status,
  totalReadyRows,
  totalRows,
}: {
  actorId: string;
  insertedRows: number;
  mode: "dry_run" | "restore";
  status: "success" | "failed";
  totalReadyRows: number;
  totalRows: number;
}) {
  if (mode !== "restore") return;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return;

  await supabase.from("activity_logs").insert({
    actor_id: actorId,
    action: status === "success" ? "restore_backup" : "restore_backup_failed",
    table_name: "backup_restore",
    record_id: null,
    metadata: {
      inserted_rows: insertedRows,
      ready_rows: totalReadyRows,
      total_rows: totalRows,
      restored_at: new Date().toISOString(),
    },
  });
}

export async function POST(request: NextRequest) {
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

  let body: RestoreRequestBody;
  try {
    body = (await request.json()) as RestoreRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = body.mode === "restore" ? "restore" : "dry_run";
  const result = await restoreBackupPayload({
    actorId: session.profile.id,
    mode,
    payload: body.payload,
    supabase,
  });

  if (mode === "restore") {
    await logRestoreAttempt({
      actorId: session.profile.id,
      insertedRows: result.totalInsertedRows,
      mode,
      status: result.errors.length > 0 ? "failed" : "success",
      totalReadyRows: result.totalReadyRows,
      totalRows: result.totalIncomingRows,
    });
  }

  return Response.json(result, { status: result.errors.length > 0 ? 422 : 200 });
}

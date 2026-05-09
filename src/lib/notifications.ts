import type { createSupabaseServerClient } from "./supabase/server";
import type { Profile } from "./types";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

export type NotificationSeverity = "info" | "warning" | "critical";
export type NotificationType =
  | "part_low_stock"
  | "part_out_of_stock"
  | "invoice_due_soon"
  | "invoice_overdue"
  | "job_waiting_parts"
  | "job_waiting_payment";
export type NotificationCategory = "stock" | "billing" | "repair";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  source_table: string;
  source_id: string;
  source_key: string;
  title: string;
  message: string;
  target_href: string;
  target_roles: string[];
  due_at: string | null;
  metadata: Record<string, unknown>;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  read_at: string | null;
};

export type NotificationPageData = {
  setupRequired: boolean;
  unavailable: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
  severityCounts: Record<NotificationSeverity, number>;
  categoryCounts: Record<NotificationCategory, number>;
  typeCounts: Record<NotificationType, number>;
  generatedAt: string | null;
};

const emptySeverityCounts: Record<NotificationSeverity, number> = {
  info: 0,
  warning: 0,
  critical: 0,
};

const emptyCategoryCounts: Record<NotificationCategory, number> = {
  stock: 0,
  billing: 0,
  repair: 0,
};

const emptyTypeCounts: Record<NotificationType, number> = {
  part_low_stock: 0,
  part_out_of_stock: 0,
  invoice_due_soon: 0,
  invoice_overdue: 0,
  job_waiting_parts: 0,
  job_waiting_payment: 0,
};

export function getNotificationCategory(type: NotificationType): NotificationCategory {
  if (type === "part_low_stock" || type === "part_out_of_stock") return "stock";
  if (type === "invoice_due_soon" || type === "invoice_overdue") return "billing";
  return "repair";
}

function isMissingNotificationsError(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42P01" ||
    error?.code === "42883" ||
    String(error?.message ?? "").includes("notifications") ||
    String(error?.message ?? "").includes("refresh_system_notifications")
  );
}

export async function refreshSystemNotifications(supabase: SupabaseServerClient) {
  const { error } = await supabase.rpc("refresh_system_notifications");
  if (error && !isMissingNotificationsError(error)) {
    console.error("refresh_system_notifications failed", error);
  }
}

async function fetchReadableNotifications(supabase: SupabaseServerClient, profile: Profile) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .contains("target_roles", [profile.role])
    .is("resolved_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    if (!isMissingNotificationsError(error)) console.error(error);
    return { unavailable: true, rows: [] as NotificationItem[] };
  }

  const rows = (data ?? []) as Omit<NotificationItem, "read_at">[];
  if (!rows.length) return { unavailable: false, rows: [] as NotificationItem[] };

  const { data: reads, error: readsError } = await supabase
    .from("notification_reads")
    .select("notification_id,read_at")
    .eq("profile_id", profile.id)
    .in("notification_id", rows.map((row) => row.id));

  if (readsError) {
    if (!isMissingNotificationsError(readsError)) console.error(readsError);
    return {
      unavailable: false,
      rows: rows.map((row) => ({ ...row, read_at: null })),
    };
  }

  const readsByNotification = new Map(
    (reads ?? []).map((row) => [String(row.notification_id), String(row.read_at)]),
  );

  return {
    unavailable: false,
    rows: rows.map((row) => ({
      ...row,
      read_at: readsByNotification.get(row.id) ?? null,
    })),
  };
}

export async function getUnreadNotificationCount(
  supabase: SupabaseServerClient,
  profile: Profile,
) {
  await refreshSystemNotifications(supabase);
  const { rows } = await fetchReadableNotifications(supabase, profile);
  return rows.filter((row) => !row.read_at).length;
}

export async function getNotificationPageData(
  supabase: SupabaseServerClient | null,
  profile: Profile,
): Promise<NotificationPageData> {
  if (!supabase) {
    return {
      setupRequired: true,
      unavailable: false,
      notifications: [],
      unreadCount: 0,
      severityCounts: emptySeverityCounts,
      categoryCounts: emptyCategoryCounts,
      typeCounts: emptyTypeCounts,
      generatedAt: null,
    };
  }

  await refreshSystemNotifications(supabase);
  const { unavailable, rows } = await fetchReadableNotifications(supabase, profile);
  const notifications = [...rows].sort((a, b) => {
    if (Boolean(a.read_at) !== Boolean(b.read_at)) return a.read_at ? 1 : -1;
    const severityRank = { critical: 0, warning: 1, info: 2 };
    const severityDiff = severityRank[a.severity] - severityRank[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const severityCounts = notifications.reduce(
    (counts, notification) => {
      counts[notification.severity] += 1;
      return counts;
    },
    { ...emptySeverityCounts },
  );
  const categoryCounts = notifications.reduce(
    (counts, notification) => {
      counts[getNotificationCategory(notification.type)] += 1;
      return counts;
    },
    { ...emptyCategoryCounts },
  );
  const typeCounts = notifications.reduce(
    (counts, notification) => {
      counts[notification.type] += 1;
      return counts;
    },
    { ...emptyTypeCounts },
  );

  return {
    setupRequired: false,
    unavailable,
    notifications,
    unreadCount: notifications.filter((row) => !row.read_at).length,
    severityCounts,
    categoryCounts,
    typeCounts,
    generatedAt: new Date().toISOString(),
  };
}

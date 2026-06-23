import {
  clean,
  type SupabaseAdminClient,
} from "../_shared/edge-config.ts";
import {
  requireAdminCaller,
  sendNotificationPayload,
  type Caller,
} from "../send-notification/notification-sender.ts";
import {
  prepareSchedulePayload,
  primaryGeneratedNotification,
} from "./notification-schedule-generator.ts";
import { scheduleToPayload } from "./notification-schedule-payload.ts";
import { nextRunAfter } from "./notification-schedule-time.ts";

export async function requireAdminOrDispatchSecret(supabase: SupabaseAdminClient, request: Request): Promise<Caller> {
  const expectedSecret = clean(Deno.env.get("NOTIFICATION_DISPATCH_SECRET"));
  const providedSecret = clean(request.headers.get("x-dispatch-secret"));

  if (expectedSecret && providedSecret && expectedSecret === providedSecret) {
    return {
      authUserId: "scheduler",
      email: "notification-scheduler@system.local",
      memberId: "scheduler",
    };
  }

  return requireAdminCaller(supabase, request);
}

export async function dispatchDueNotifications(
  supabase: SupabaseAdminClient,
  input: {
    actorEmail: string;
    limit?: number;
    now?: string;
    scheduleId?: string;
  }
) {
  const now = input.now ? new Date(input.now) : new Date();
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

  let query = supabase
    .from("notification_schedules")
    .select("*")
    .order("next_run_at", { ascending: true })
    .limit(limit);

  if (clean(input.scheduleId)) {
    query = query.eq("id", clean(input.scheduleId));
  } else {
    query = query.eq("status", "active").lte("next_run_at", now.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;

  const schedules = (data ?? []) as Record<string, unknown>[];
  const dispatched = [];

  for (const schedule of schedules) {
    const prepared = await prepareSchedulePayload(schedule, scheduleToPayload(schedule), now);
    const result = await sendNotificationPayload(
      supabase,
      prepared.payload,
      input.actorEmail,
    );
    const failed = Number(result.errorCount ?? 0) > 0;
    const scheduleType = clean(schedule.schedule_type);
    const nextRunAt = nextRunAfter(schedule, now);
    const nextStatus =
      scheduleType === "once"
        ? failed ? "failed" : "completed"
        : clean(schedule.status) === "paused" ? "paused" : "active";
    const lastError = result.results.find((item) => !item.ok)?.error ?? null;
    const primaryGenerated = prepared.generatedNotifications
      ? primaryGeneratedNotification(prepared.generatedNotifications)
      : null;
    const updatePayload: Record<string, unknown> = {
      last_error: lastError,
      last_run_at: now.toISOString(),
      last_status: failed ? "failed" : "sent",
      next_run_at: nextRunAt?.toISOString() ?? null,
      run_count: Number(schedule.run_count ?? 0) + 1,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    if (prepared.generatedNotifications) {
      updatePayload.locale_payload = prepared.generatedNotifications;
      updatePayload.message = clean(primaryGenerated?.message) || null;
      updatePayload.title = clean(primaryGenerated?.title) || null;
    }

    const { error: updateError } = await supabase
      .from("notification_schedules")
      .update(updatePayload)
      .eq("id", clean(schedule.id));

    if (updateError) throw updateError;

    dispatched.push({
      errorCount: result.errorCount,
      job: result.job,
      scheduleId: clean(schedule.id),
      sentCount: result.sentCount,
      status: failed ? "failed" : "sent",
    });
  }

  return {
    dispatched,
    now: now.toISOString(),
    total: dispatched.length,
  };
}

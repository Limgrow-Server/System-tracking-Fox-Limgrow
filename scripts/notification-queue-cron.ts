import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import {
  endpointFailed,
  errorMessage,
  hasFlag,
  intEnv,
  isRecord,
  normalizeUrl,
  runtimeMode,
  sleep,
  type CronLoop,
} from "./cron-utils";

const DEFAULT_NOTIFICATION_QUEUE_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const currentFile = fileURLToPath(import.meta.url);
const dirname = path.dirname(currentFile);
const projectRoot = path.resolve(dirname, "..");

function resolveNotificationQueueCronUrl() {
  const explicitUrl = process.env.NOTIFICATION_QUEUE_CRON_URL?.trim();
  if (explicitUrl) return normalizeUrl(explicitUrl);

  return `${normalizeUrl(
    `http://127.0.0.1:${process.env.PORT || "3000"}`,
  )}/api/cron/notification-batches`;
}

function summarizeNotificationQueueResult(payload: unknown) {
  const result = isRecord(payload) ? payload.result : null;

  if (!isRecord(result)) {
    return "no result payload";
  }

  return JSON.stringify({
    checkedAt: result.checkedAt,
    claimed: result.claimed,
    processed: Array.isArray(result.processed) ? result.processed.length : 0,
    recovered: result.recovered,
    spool: result.spool,
  });
}

export async function runNotificationQueueCronOnce(
  url: string,
  signal: AbortSignal,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();
  const dispatchSecret =
    process.env.NOTIFICATION_DISPATCH_SECRET ||
    process.env.NOTIFICATION_QUEUE_SECRET ||
    "";

  if (signal.aborted) {
    controller.abort();
  } else {
    signal.addEventListener("abort", abortFromParent, { once: true });
  }

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(dispatchSecret
          ? {
              "x-dispatch-secret": dispatchSecret,
              "x-notification-queue-secret": dispatchSecret,
            }
          : {}),
        "user-agent": "limgrow-notification-queue/1.0",
      },
      method: "POST",
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;

    if (!response.ok || endpointFailed(payload)) {
      throw new Error(
        text || `Notification queue endpoint returned HTTP ${response.status}`,
      );
    }

    const claimed =
      isRecord(payload) && isRecord(payload.result)
        ? Number(payload.result.claimed ?? 0)
        : 0;

    if (claimed > 0) {
      console.log(
        `[notification-queue] ${new Date().toISOString()} ok ${summarizeNotificationQueueResult(
          payload,
        )}`,
      );
    }
  } finally {
    signal.removeEventListener("abort", abortFromParent);
    clearTimeout(timeout);
  }
}

export function startNotificationQueueCronLoop(): CronLoop {
  const controller = new AbortController();
  const signal = controller.signal;
  const url = resolveNotificationQueueCronUrl();
  const intervalMs = intEnv(
    "NOTIFICATION_QUEUE_INTERVAL_MS",
    DEFAULT_NOTIFICATION_QUEUE_INTERVAL_MS,
    1000,
  );

  console.log(
    `[notification-queue] running every ${intervalMs}ms against ${url}`,
  );

  void (async () => {
    await sleep(5_000, signal);

    while (!signal.aborted) {
      try {
        await runNotificationQueueCronOnce(url, signal);
      } catch (error) {
        console.error(
          `[notification-queue] ${new Date().toISOString()} failed: ${errorMessage(
            error,
          )}`,
        );
      }

      await sleep(intervalMs, signal);
    }
  })();

  return {
    stop() {
      controller.abort();
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  loadEnvConfig(projectRoot, runtimeMode(args) === "dev");

  const controller = new AbortController();

  if (hasFlag(args, "--once")) {
    await runNotificationQueueCronOnce(
      resolveNotificationQueueCronUrl(),
      controller.signal,
    );
    return;
  }

  const loop = startNotificationQueueCronLoop();

  function shutdown() {
    loop.stop();
    setTimeout(() => process.exit(0), 250).unref();
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  void main().catch((error) => {
    console.error(`[notification-queue] fatal=${errorMessage(error)}`);
    process.exit(1);
  });
}

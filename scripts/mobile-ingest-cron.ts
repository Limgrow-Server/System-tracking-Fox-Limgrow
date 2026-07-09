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
  numberValue,
  runtimeMode,
  sleep,
  type CronLoop,
} from "./cron-utils";

const DEFAULT_MOBILE_INGEST_INTERVAL_MS = 5_000;
const DEFAULT_MOBILE_INGEST_ACTIVE_INTERVAL_MS = 250;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const currentFile = fileURLToPath(import.meta.url);
const dirname = path.dirname(currentFile);
const projectRoot = path.resolve(dirname, "..");

type MobileIngestCronResult = {
  claimed: number;
  processed: number;
  recovered: number;
  spoolRetained: number;
};

function resolveMobileIngestCronUrl() {
  const explicitUrl = process.env.MOBILE_INGEST_CRON_URL?.trim();
  if (explicitUrl) return normalizeUrl(explicitUrl);

  return `${normalizeUrl(
    `http://127.0.0.1:${process.env.PORT || "3000"}`,
  )}/api/cron/mobile-ingest`;
}

function summarizeMobileIngestResult(payload: unknown) {
  const result = isRecord(payload) ? payload.result : null;

  if (!isRecord(result)) {
    return "no result payload";
  }

  return JSON.stringify({
    checkedAt: result.checkedAt,
    claimed: result.claimed,
    processed: Array.isArray(result.processed) ? result.processed.length : 0,
    recovered: result.recovered,
  });
}

export async function runMobileIngestCronOnce(
  url: string,
  signal: AbortSignal,
): Promise<MobileIngestCronResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();
  const cronSecret =
    process.env.MOBILE_INGEST_SECRET ||
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
        ...(cronSecret
          ? {
              "x-cron-secret": cronSecret,
              "x-mobile-ingest-secret": cronSecret,
              "x-notification-queue-secret": cronSecret,
            }
          : {}),
        "user-agent": "limgrow-mobile-ingest/1.0",
      },
      method: "POST",
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;

    if (!response.ok || endpointFailed(payload)) {
      throw new Error(
        text || `Mobile ingest endpoint returned HTTP ${response.status}`,
      );
    }

    const result = isRecord(payload) && isRecord(payload.result)
      ? payload.result
      : {};
    const claimed = numberValue(result.claimed);

    if (claimed > 0) {
      console.log(
        `[mobile-ingest] ${new Date().toISOString()} ok ${summarizeMobileIngestResult(
          payload,
        )}`,
      );
    }

    const spool = isRecord(result.spool) ? result.spool : {};

    return {
      claimed,
      processed: Array.isArray(result.processed) ? result.processed.length : 0,
      recovered: numberValue(result.recovered),
      spoolRetained: numberValue(spool.retained),
    };
  } finally {
    signal.removeEventListener("abort", abortFromParent);
    clearTimeout(timeout);
  }
}

export function startMobileIngestCronLoop(): CronLoop {
  const controller = new AbortController();
  const signal = controller.signal;
  const url = resolveMobileIngestCronUrl();
  const intervalMs = intEnv(
    "MOBILE_INGEST_INTERVAL_MS",
    DEFAULT_MOBILE_INGEST_INTERVAL_MS,
    1000,
  );
  const activeIntervalMs = intEnv(
    "MOBILE_INGEST_ACTIVE_INTERVAL_MS",
    DEFAULT_MOBILE_INGEST_ACTIVE_INTERVAL_MS,
    100,
  );

  console.log(`[mobile-ingest] running every ${intervalMs}ms against ${url}`);

  void (async () => {
    await sleep(3_000, signal);

    while (!signal.aborted) {
      let nextDelayMs = intervalMs;

      try {
        const result = await runMobileIngestCronOnce(url, signal);
        if (result.claimed > 0 || result.spoolRetained > 0) {
          nextDelayMs = activeIntervalMs;
        }
      } catch (error) {
        console.error(
          `[mobile-ingest] ${new Date().toISOString()} failed: ${errorMessage(
            error,
          )}`,
        );
      }

      await sleep(nextDelayMs, signal);
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
    await runMobileIngestCronOnce(
      resolveMobileIngestCronUrl(),
      controller.signal,
    );
    return;
  }

  const loop = startMobileIngestCronLoop();

  function shutdown() {
    loop.stop();
    setTimeout(() => process.exit(0), 250).unref();
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  void main().catch((error) => {
    console.error(`[mobile-ingest] fatal=${errorMessage(error)}`);
    process.exit(1);
  });
}

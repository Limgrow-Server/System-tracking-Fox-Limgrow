import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_INTERVAL_MS = 3 * 60_000;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const INITIAL_CRON_DELAY_MS = 15_000;
const DEFAULT_NOTIFICATION_QUEUE_INTERVAL_MS = 10_000;
const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, "..");
const nextBin = path.join(
  projectRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);

type CronLoop = {
  stop: () => void;
};

type RuntimeCommand = "cron" | "dev" | "start";

function commandFromLifecycle(value: string | undefined): RuntimeCommand {
  if (value === "dev") return "dev";
  if (value === "start:cron") return "cron";
  return "start";
}

function resolveRuntimeCommand(args: string[]) {
  const [firstArg, ...restArgs] = args;

  if (firstArg === "cron" || firstArg === "dev" || firstArg === "start") {
    return {
      command: firstArg,
      forwardedArgs: restArgs,
    };
  }

  return {
    command: commandFromLifecycle(process.env.npm_lifecycle_event),
    forwardedArgs: args,
  };
}

function portFromArgs(args: string[]) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if ((arg === "-p" || arg === "--port") && args[index + 1]) {
      return args[index + 1];
    }

    if (arg.startsWith("--port=")) {
      return arg.slice("--port=".length);
    }
  }

  return process.env.PORT || "3000";
}

function intEnv(name: string, fallback: number, min: number) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(Math.floor(parsed), min);
}

function normalizeUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveReviewFetchCronUrl() {
  const explicitUrl = process.env.REVIEW_FETCH_CRON_URL?.trim();
  if (explicitUrl) return normalizeUrl(explicitUrl);

  return `${normalizeUrl(
    `http://127.0.0.1:${process.env.PORT || "3000"}`,
  )}/api/cron/review-fetch`;
}

function resolveNotificationQueueCronUrl() {
  const explicitUrl = process.env.NOTIFICATION_QUEUE_CRON_URL?.trim();
  if (explicitUrl) return normalizeUrl(explicitUrl);

  return `${normalizeUrl(
    `http://127.0.0.1:${process.env.PORT || "3000"}`,
  )}/api/cron/notification-batches`;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timeout = setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function summarizeCronResult(payload: unknown) {
  const result = isRecord(payload) ? payload.result : null;

  if (!isRecord(result)) {
    return "no result payload";
  }

  return JSON.stringify({
    checkedAt: result.checkedAt,
    materialized: result.materialized,
    retention: result.retention,
    stale: result.stale,
    worker: result.worker,
  });
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
  });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function runReviewFetchCronOnce(url: string, signal: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();

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
        "user-agent": "limgrow-review-fetch-cron/1.0",
      },
      method: "POST",
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;
    const endpointFailed =
      isRecord(payload) && (payload.success === false || payload.ok === false);

    if (!response.ok || endpointFailed) {
      throw new Error(text || `Cron endpoint returned HTTP ${response.status}`);
    }

    console.log(
      `[review-fetch-cron] ${new Date().toISOString()} ok ${summarizeCronResult(
        payload,
      )}`,
    );
  } finally {
    signal.removeEventListener("abort", abortFromParent);
    clearTimeout(timeout);
  }
}

async function runNotificationQueueCronOnce(url: string, signal: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();
  const dispatchSecret = process.env.NOTIFICATION_DISPATCH_SECRET || process.env.NOTIFICATION_QUEUE_SECRET || "";

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
        ...(dispatchSecret ? {
          "x-dispatch-secret": dispatchSecret,
          "x-notification-queue-secret": dispatchSecret,
        } : {}),
        "user-agent": "limgrow-notification-queue/1.0",
      },
      method: "POST",
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;
    const endpointFailed =
      isRecord(payload) && (payload.success === false || payload.ok === false);

    if (!response.ok || endpointFailed) {
      throw new Error(text || `Notification queue endpoint returned HTTP ${response.status}`);
    }

    const claimed = isRecord(payload) && isRecord(payload.result) ? Number(payload.result.claimed ?? 0) : 0;
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

function startReviewFetchCronLoop(): CronLoop {
  const controller = new AbortController();
  const signal = controller.signal;
  const url = resolveReviewFetchCronUrl();

  console.log(
    `[review-fetch-cron] running every ${DEFAULT_INTERVAL_MS}ms against ${url}`,
  );

  void (async () => {
    await sleep(INITIAL_CRON_DELAY_MS, signal);

    while (!signal.aborted) {
      try {
        await runReviewFetchCronOnce(url, signal);
      } catch (error) {
        console.error(
          `[review-fetch-cron] ${new Date().toISOString()} failed: ${errorMessage(
            error,
          )}`,
        );
      }

      await sleep(DEFAULT_INTERVAL_MS, signal);
    }
  })();

  return {
    stop() {
      controller.abort();
    },
  };
}

function startNotificationQueueCronLoop(): CronLoop {
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

const { command, forwardedArgs } = resolveRuntimeCommand(process.argv.slice(2));
const port = portFromArgs(forwardedArgs);
const nextArgs = [command, ...forwardedArgs];
const nextEnv = {
  ...process.env,
  PORT: port,
};

process.env.PORT = port;

if (command === "cron") {
  console.log(`[cron] workers on port ${port}`);
  const cronLoops = [startReviewFetchCronLoop(), startNotificationQueueCronLoop()];

  function shutdownCron() {
    cronLoops.forEach((cronLoop) => cronLoop.stop());
    process.exit(0);
  }

  process.on("SIGINT", shutdownCron);
  process.on("SIGTERM", shutdownCron);
} else {
  console.log(`[${command}] next ${nextArgs.join(" ")}`);

  const nextProcess = spawn(process.execPath, [nextBin, ...nextArgs], {
    cwd: projectRoot,
    env: nextEnv,
    stdio: "inherit",
  });

  let cronLoops: CronLoop[] = [startReviewFetchCronLoop(), startNotificationQueueCronLoop()];
  let shuttingDown = false;

  function shutdown(signal: NodeJS.Signals) {
    if (shuttingDown) return;
    shuttingDown = true;

    cronLoops.forEach((cronLoop) => cronLoop.stop());
    cronLoops = [];

    if (nextProcess.exitCode === null && !nextProcess.killed) {
      nextProcess.kill(signal);
    }

    setTimeout(() => {
      process.exit(0);
    }, 10_000).unref();
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  nextProcess.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
    cronLoops.forEach((cronLoop) => cronLoop.stop());
    cronLoops = [];

    if (shuttingDown) {
      process.exit(0);
    }

    if (signal) {
      console.log(`[${command}] next exited by ${signal}`);
      process.exit(1);
    }

    process.exit(code ?? 0);
  });

  nextProcess.on("error", (error: Error) => {
    cronLoops.forEach((cronLoop) => cronLoop.stop());
    cronLoops = [];
    console.error(`[${command}] failed to start next: ${error.message}`);
    process.exit(1);
  });
}

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_INTERVAL_MS = 3 * 60_000;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const INITIAL_CRON_DELAY_MS = 15_000;
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

function normalizeUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveReviewFetchCronUrl() {
  return `${normalizeUrl(
    `http://127.0.0.1:${process.env.PORT || "3000"}`,
  )}/api/cron/review-fetch`;
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

const forwardedArgs = process.argv.slice(2);
const port = portFromArgs(forwardedArgs);
const nextArgs = ["dev", ...forwardedArgs];
const nextEnv = {
  ...process.env,
  PORT: port,
};

process.env.PORT = port;

console.log(`[dev] next ${nextArgs.join(" ")}`);

const nextProcess = spawn(process.execPath, [nextBin, ...nextArgs], {
  cwd: projectRoot,
  env: nextEnv,
  stdio: "inherit",
});

let cronLoop: CronLoop | null = startReviewFetchCronLoop();
let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;

  cronLoop?.stop();
  cronLoop = null;

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
  cronLoop?.stop();
  cronLoop = null;

  if (shuttingDown) {
    process.exit(0);
  }

  if (signal) {
    console.log(`[dev] next exited by ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 0);
});

nextProcess.on("error", (error: Error) => {
  cronLoop?.stop();
  cronLoop = null;
  console.error(`[dev] failed to start next: ${error.message}`);
  process.exit(1);
});

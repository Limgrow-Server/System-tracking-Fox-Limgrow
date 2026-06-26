import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_INTERVAL_MS = 3 * 60_000;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

type CronLogger = Pick<Console, "error" | "log">;

export type ReviewFetchCronOptions = {
  initialDelayMs?: number;
  logger?: CronLogger;
  signal?: AbortSignal;
  url?: string;
};

export type ReviewFetchCronLoop = {
  done: Promise<void>;
  stop: () => void;
};

function normalizeUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export function resolveReviewFetchCronUrl(env: NodeJS.ProcessEnv = process.env) {
  const appUrl = `http://127.0.0.1:${env.PORT || "3000"}`;

  return `${normalizeUrl(appUrl)}/api/cron/review-fetch`;
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

function summarizeResult(payload: unknown) {
  const result = isRecord(payload) ? payload.result : null;

  if (!isRecord(result)) {
    return "no result payload";
  }

  return JSON.stringify({
    checkedAt: result.checkedAt,
    materialized: result.materialized,
    worker: result.worker,
    stale: result.stale,
    retention: result.retention,
  });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function runReviewFetchCronOnce(options: ReviewFetchCronOptions = {}) {
  const url = options.url || resolveReviewFetchCronUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();

  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener("abort", abortFromParent, { once: true });
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "limgrow-review-fetch-cron/1.0",
      },
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;
    const endpointFailed =
      isRecord(payload) && (payload.success === false || payload.ok === false);

    if (!response.ok || endpointFailed) {
      throw new Error(text || `Cron endpoint returned HTTP ${response.status}`);
    }

    options.logger?.log(
      `[review-fetch-cron] ${new Date().toISOString()} ok ${summarizeResult(
        payload,
      )}`,
    );

    return payload;
  } finally {
    options.signal?.removeEventListener("abort", abortFromParent);
    clearTimeout(timeout);
  }
}

export function startReviewFetchCronLoop(
  options: ReviewFetchCronOptions = {},
): ReviewFetchCronLoop {
  const logger = options.logger || console;
  const controller = new AbortController();
  const signal = controller.signal;
  const abortFromParent = () => controller.abort();

  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener("abort", abortFromParent, { once: true });
  }

  const url = options.url || resolveReviewFetchCronUrl();
  logger.log(
    `[review-fetch-cron] running every ${DEFAULT_INTERVAL_MS}ms against ${url}`,
  );

  const done = (async () => {
    if (options.initialDelayMs) {
      await sleep(options.initialDelayMs, signal);
    }

    while (!signal.aborted) {
      try {
        await runReviewFetchCronOnce({ logger, signal, url });
      } catch (error) {
        logger.error(
          `[review-fetch-cron] ${new Date().toISOString()} failed: ${errorMessage(
            error,
          )}`,
        );
      }

      await sleep(DEFAULT_INTERVAL_MS, signal);
    }
  })();

  return {
    done,
    stop() {
      options.signal?.removeEventListener("abort", abortFromParent);
      controller.abort();
    },
  };
}

const isMainModule =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isMainModule) {
  const loop = startReviewFetchCronLoop();

  const shutdown = () => {
    loop.stop();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

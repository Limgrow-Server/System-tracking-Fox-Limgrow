export type CronLoop = {
  stop: () => void;
};

export type RuntimeMode = "dev" | "start";

export function runtimeMode(args: string[]): RuntimeMode {
  const firstArg = args[0]?.trim().toLowerCase();
  return firstArg === "start" || firstArg === "production" ? "start" : "dev";
}

export function hasFlag(args: string[], flag: string) {
  return args.includes(flag);
}

export function intEnv(name: string, fallback: number, min: number) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(Math.floor(parsed), min);
}

export function boolEnv(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["0", "false", "no", "off", "disabled"].includes(value)) return false;
  if (["1", "true", "yes", "on", "enabled"].includes(value)) return true;
  return fallback;
}

export function normalizeUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export function sleep(ms: number, signal?: AbortSignal) {
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function endpointFailed(payload: unknown) {
  return isRecord(payload) && (payload.success === false || payload.ok === false);
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

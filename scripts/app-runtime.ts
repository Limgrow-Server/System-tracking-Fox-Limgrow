import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import { boolEnv, type CronLoop } from "./cron-utils";
import { startIosIapTwoHourCronLoop } from "./ios-iap-two-hour-cron";
import { startMobileIngestCronLoop } from "./mobile-ingest-cron";
import { startNotificationQueueCronLoop } from "./notification-queue-cron";
import { startReviewFetchCronLoop } from "./review-fetch-cron";

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

type RuntimeCommand = "cron" | "dev" | "start";

type ServerLoopDefinition = {
  enabledEnvName: string;
  label: string;
  start: () => CronLoop;
};

const serverLoopDefinitions: ServerLoopDefinition[] = [
  {
    enabledEnvName: "MOBILE_INGEST_ENABLED",
    label: "mobile-ingest",
    start: startMobileIngestCronLoop,
  },
  {
    enabledEnvName: "REVIEW_FETCH_CRON_ENABLED",
    label: "review-fetch-cron",
    start: startReviewFetchCronLoop,
  },
  {
    enabledEnvName: "NOTIFICATION_QUEUE_ENABLED",
    label: "notification-queue",
    start: startNotificationQueueCronLoop,
  },
  {
    enabledEnvName: "IOS_IAP_2HOUR_ENABLED",
    label: "ios-iap-2hour-ga4",
    start: startIosIapTwoHourCronLoop,
  },
];

function commandFromLifecycle(value: string | undefined): RuntimeCommand {
  if (value === "dev") return "dev";
  if (value === "start:cron" || value === "cron:all") return "cron";
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

function maybeStartLoop(definition: ServerLoopDefinition) {
  if (!boolEnv(definition.enabledEnvName, true)) {
    console.log(
      `[${definition.label}] disabled by ${definition.enabledEnvName}=false`,
    );
    return null;
  }

  return definition.start();
}

function startServerLoops() {
  return serverLoopDefinitions
    .map(maybeStartLoop)
    .filter((loop): loop is CronLoop => Boolean(loop));
}

function stopServerLoops(loops: CronLoop[]) {
  loops.forEach((loop) => loop.stop());
}

const { command, forwardedArgs } = resolveRuntimeCommand(process.argv.slice(2));
loadEnvConfig(projectRoot, command === "dev");

const port = portFromArgs(forwardedArgs);
const nextArgs = [command, ...forwardedArgs];
const nextEnv = {
  ...process.env,
  PORT: port,
};

process.env.PORT = port;

if (command === "cron") {
  console.log(`[cron] workers on port ${port}`);
  const loops = startServerLoops();

  function shutdownCron() {
    stopServerLoops(loops);
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

  let loops = startServerLoops();
  let shuttingDown = false;

  function shutdown(signal: NodeJS.Signals) {
    if (shuttingDown) return;
    shuttingDown = true;

    stopServerLoops(loops);
    loops = [];

    if (nextProcess.exitCode === null && !nextProcess.killed) {
      nextProcess.kill(signal);
    }

    setTimeout(() => {
      process.exit(0);
    }, 10_000).unref();
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  nextProcess.on(
    "exit",
    (code: number | null, signal: NodeJS.Signals | null) => {
      stopServerLoops(loops);
      loops = [];

      if (shuttingDown) {
        process.exit(0);
      }

      if (signal) {
        console.log(`[${command}] next exited by ${signal}`);
        process.exit(1);
      }

      process.exit(code ?? 0);
    },
  );

  nextProcess.on("error", (error: Error) => {
    stopServerLoops(loops);
    loops = [];
    console.error(`[${command}] failed to start next: ${error.message}`);
    process.exit(1);
  });
}

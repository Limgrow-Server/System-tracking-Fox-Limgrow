import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  startReviewFetchCronLoop,
  type ReviewFetchCronLoop,
} from "./review-fetch-cron";

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

const nextArgs = ["start", ...process.argv.slice(2)];

console.log(`[start] next ${nextArgs.join(" ")}`);

const nextProcess = spawn(process.execPath, [nextBin, ...nextArgs], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
});

let cronLoop: ReviewFetchCronLoop | null = null;
let shuttingDown = false;

cronLoop = startReviewFetchCronLoop({
  initialDelayMs: 15_000,
});

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;

  cronLoop?.stop();

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

  if (shuttingDown) {
    process.exit(0);
  }

  if (signal) {
    console.log(`[start] next exited by ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 0);
});

nextProcess.on("error", (error: Error) => {
  cronLoop?.stop();
  console.error(`[start] failed to start next: ${error.message}`);
  process.exit(1);
});

import { execFileSync } from "node:child_process";

const allowedBranches = new Set(["main", "master", "develop", "dev", "staging", "production"]);
const allowedPattern =
  /^(feature|feat|fix|bugfix|hotfix|release|chore|docs|refactor|test|ci|build|codex|dependabot)\/[a-z0-9][a-z0-9._-]*$/;

function currentBranch() {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const branch = currentBranch();

if (!branch || branch === "HEAD") {
  process.exit(0);
}

if (allowedBranches.has(branch) || allowedPattern.test(branch)) {
  process.exit(0);
}

console.error(`Invalid branch name: ${branch}`);
console.error("");
console.error("Use one of:");
console.error("  main, master, develop, dev, staging, production");
console.error("  feature/<slug>, fix/<slug>, hotfix/<slug>, release/<slug>");
console.error("  chore/<slug>, docs/<slug>, refactor/<slug>, test/<slug>, codex/<slug>");
console.error("");
console.error("Example: feature/notification, fix/app-mapping, codex/notification-ui");
process.exit(1);

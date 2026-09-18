const path = require("node:path");

const root = "/opt/system-tracking";

module.exports = {
  apps: [
    {
      name: "system-tracking-ui-active",
      script: path.join(root, "release-runner.cjs"),
      cwd: root,
      exec_mode: "cluster",
      instances: Math.max(
        2,
        Number.parseInt(process.env.PM2_UI_INSTANCES || "2", 10) || 2,
      ),
      listen_timeout: 20_000,
      kill_timeout: 30_000,
      min_uptime: "10s",
      max_restarts: 10,
      max_memory_restart: "750M",
      autorestart: true,
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "production",
        HOSTNAME: "0.0.0.0",
        PORT: process.env.PORT || "3003",
        SYSTEM_TRACKING_RUNNER_ENTRY: "server.js",
      },
    },
  ],
};

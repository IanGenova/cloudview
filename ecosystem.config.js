const dotenv = require("dotenv");
const path = require("path");

const PROJECT_ROOT = path.resolve("C:/Users/iange/Downloads/cloudviewhotel/cloudview");
const CENTRIFUGO_ROOT = path.join(PROJECT_ROOT, "centrifugo");

dotenv.config({
  path: path.join(PROJECT_ROOT, ".env"),
});

module.exports = {
  apps: [
    {
      name: "centrifugo-server",
      script: path.join(CENTRIFUGO_ROOT, "centrifugo.exe"),
      args: "--config=config.json",
      cwd: CENTRIFUGO_ROOT,
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      env: {
        ...process.env,
      },
    },

    {
      name: "cloudview-nextjs",
      script: path.join(PROJECT_ROOT, "node_modules/next/dist/bin/next"),
      args: "start",
      cwd: PROJECT_ROOT,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        ...process.env,
      },
    },

    {
      name: "cloudview-scheduler",
      script: path.join(PROJECT_ROOT, "scripts/release-scheduled-worker.mjs"),
      cwd: PROJECT_ROOT,
      interpreter: "node",
      autorestart: true,
      watch: false,
      max_memory_restart: "150M",
      restart_delay: 5000,
      env: {
        ...process.env,
      },
    },
  ],
};
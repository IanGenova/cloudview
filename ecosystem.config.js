const dotenv = require("dotenv");
const path = require("path");

const PROJECT_ROOT = "D:\Genova\NASPIN TECH\PROJECTS\cloud-view-mvp";

// Loads your Next.js environment variables
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

module.exports = {
apps: [
// 1. YOUR CENTRIFUGO SERVER
{
name: "centrifugo-server",
script: "centrifugo.exe",
args: "--config=config.json",
cwd: path.join(PROJECT_ROOT, "centrifugo"),
interpreter: "none",
autorestart: true,
watch: false,
max_memory_restart: "200M",
env: {
...process.env,
},
},


// 2. YOUR NEXT.JS SERVER
{
  name: "cloudview-nextjs",
  script: "node_modules/next/dist/bin/next",
  args: "start",
  cwd: PROJECT_ROOT,
  autorestart: true,
  watch: false,
  max_memory_restart: "500M",
  env: {
    ...process.env,
  },
},

// 3. SCHEDULED FOOD / SERVICE RELEASE WORKER
{
  name: "cloudview-scheduler",
  script: "scripts/release-scheduled-worker.mjs",
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

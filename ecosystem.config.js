const dotenv = require("dotenv");
const path = require("path");

// Loads your Next.js environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

module.exports = {
  apps: [
    // 1. YOUR CENTRIFUGO SERVER
    {
      name: "centrifugo-server",
      script: "centrifugo.exe", 
      args: "--config=config.json",
      cwd: "D:\\Genova\\NASPIN TECH\\PROJECTS\\cloud-view-mvp\\centrifugo",
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      env: {
        ...process.env
      }
    },
    // 2. YOUR NEXT.JS SERVER (This runs your realtime code)
    {
      name: "cloudview-nextjs",
      // Point PM2 directly to the Next.js core file inside your project
      script: "node_modules/next/dist/bin/next",
      // Notice this is just "dev" now, NOT "run dev"
      args: "dev", 
      cwd: "D:\\Genova\\NASPIN TECH\\PROJECTS\\cloud-view-mvp",
      autorestart: true,
      watch: false,
      env: {
        ...process.env
      }
    }
  ]
};
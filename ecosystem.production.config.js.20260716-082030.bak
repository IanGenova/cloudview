module.exports = {
  apps: [
    {
      name: "cloudview-nextjs",
      cwd: "/var/www/cloudview",
      script: "/var/www/cloudview/node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      interpreter: process.execPath,
      autorestart: true,
      watch: false,
      restart_delay: 3000,
      max_restarts: 20,
      max_memory_restart: "700M",
      time: true,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "cloudview-scheduler",
      cwd: "/var/www/cloudview",
      script: "/var/www/cloudview/scripts/release-scheduled-worker.mjs",
      interpreter: process.execPath,
      autorestart: true,
      watch: false,
      restart_delay: 5000,
      max_memory_restart: "200M",
      time: true,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};

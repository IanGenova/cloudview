module.exports = {
  apps: [
    {
      name: "cloudview-nextjs",
      cwd: "/var/www/cloudview",
      script: "./node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      interpreter: "node",
      autorestart: true,
      watch: false,
      max_memory_restart: "700M",
      restart_delay: 3000,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "cloudview-scheduler",
      cwd: "/var/www/cloudview",
      script: "./scripts/release-scheduled-worker.mjs",
      interpreter: "node",
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      restart_delay: 5000,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
    /*
     * Drives /api/xendit/refunds/retry.
     *
     * That endpoint and the retry logic behind it already existed and were
     * correct, and nothing anywhere called them -- no cron, no timer, no nginx
     * location, no PM2 app. A guest refund that failed once stayed FAILED
     * forever, with no automated recovery and no dashboard surface to retry it.
     */
    {
      name: "cloudview-refund-retry",
      cwd: "/var/www/cloudview",
      script: "./scripts/refund-retry-worker.mjs",
      interpreter: "node",
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      restart_delay: 5000,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

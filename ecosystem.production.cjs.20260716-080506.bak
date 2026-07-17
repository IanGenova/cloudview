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
  ],
};

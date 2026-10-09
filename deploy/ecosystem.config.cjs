const path = require('path');

/*
 * PM2 process config (PRD §9, milestone 6).
 *
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save && pm2 startup
 *
 * Runs the Node CMS on 127.0.0.1:3000 behind Caddy. Secrets stay in .env
 * (loaded by server/config.js) — never inline them here.
 */
module.exports = {
  apps: [
    {
      name: 'sabi-cms',
      script: 'server/app.js',
      cwd: path.resolve(__dirname, '..'),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      out_file: './logs/sabi-out.log',
      error_file: './logs/sabi-err.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
    },
  ],
};

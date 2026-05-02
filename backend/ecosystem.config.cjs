/**
 * PM2 Ecosystem Config
 * Docs: https://pm2.keymetrics.io/docs/usage/application-declaration/
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 reload ecosystem.config.cjs --env production
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'nxt1-backend',
      script: './dist/index.js',
      cwd: '/home/vyacheslav_rud1996/nxt1-repo/backend', // path thực trên server

      // Số instances (cluster mode để tận dụng đa CPU)
      instances: 'max', // hoặc số cụ thể: 2, 4...
      exec_mode: 'cluster',

      // Tự restart khi crash
      autorestart: true,
      watch: false, // Tắt — dùng CI/CD để reload, không watch file
      max_memory_restart: '1G',

      // Graceful reload: chờ các request hiện tại xử lý xong
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,

      // Log
      out_file: '/home/ngocsonxx98/pm2-nxt1-out.log',
      error_file: '/home/ngocsonxx98/pm2-nxt1-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      env: {
        NODE_ENV: 'development',
      },
      env_staging: {
        NODE_ENV: 'staging',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],

  // ─────────────────────────────────────────────────────────────
  // PM2 Deploy Config (Option A-2: dùng `pm2 deploy` từ CI)
  // ─────────────────────────────────────────────────────────────
  deploy: {
    production: {
      user: 'ngocsonxx98',
      host: ['34.72.3.113'],
      ref: 'origin/main',
      repo: 'git@github.com:nxt1/nxt1-repo.git', // ← cập nhật đúng repo URL
      path: '/home/vyacheslav_rud1996/nxt1-repo',
      'pre-deploy-local': '',
      'post-deploy': 'npm i && npm run build && pm2 reload 1 --update-env',
      'pre-setup': '',
    },
    staging: {
      user: 'ngocsonxx98',
      host: ['34.72.3.113'],
      ref: 'origin/develop',
      repo: 'git@github.com:nxt1/nxt1-repo.git',
      path: '/home/vyacheslav_rud1996/nxt1-repo',
      'post-deploy': 'npm i && npm run build && pm2 reload 1 --update-env',
    },
  },
};

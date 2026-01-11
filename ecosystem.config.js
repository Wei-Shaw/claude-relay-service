module.exports = {
  apps: [{
    name: 'claude-relay',
    script: 'src/app.js',
    node_args: '--max-old-space-size=512',  // 增加堆内存限制到512MB
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '450M',  // 内存超过450MB时自动重启
    env: {
      NODE_ENV: 'production'
    },
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
}

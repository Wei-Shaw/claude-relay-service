const backupService = require('./backupService');
const logger = require('../utils/logger');

class BackupScheduler {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.checkInterval = 10000; // 默认每10秒检查一次
  }

  // 启动定时备份任务
  async start() {
    try {
      const settings = await backupService.getBackupSettings();
      
      if (!settings.autoBackupEnabled) {
        logger.info('📅 Auto backup is disabled');
        return;
      }

      // 停止现有任务
      this.stop();

      // 动态计算检查间隔：备份间隔的1/10，最小10秒，最大5分钟
      const intervalMs = settings.autoBackupInterval * 60 * 60 * 1000; // 转换为毫秒
      this.checkInterval = Math.max(10000, Math.min(intervalMs / 10, 300000));

      // 使用 setInterval 定期检查是否需要备份
      this.intervalId = setInterval(async () => {
        await this.checkAndRunBackup();
      }, this.checkInterval);

      logger.info(`📅 Backup scheduler started with interval: ${settings.autoBackupInterval} hours (checking every ${this.checkInterval/1000}s)`);
      
      // 立即检查是否需要备份
      await this.checkAndRunBackup();
    } catch (error) {
      logger.error('❌ Failed to start backup scheduler:', error);
    }
  }

  // 检查并执行备份
  async checkAndRunBackup() {
    if (this.isRunning) {
      logger.warn('⚠️ Backup is already running, skipping...');
      return;
    }

    try {
      this.isRunning = true;
      const settings = await backupService.getBackupSettings();
      
      if (!settings.autoBackupEnabled) {
        logger.info('📅 Auto backup is disabled, skipping...');
        return;
      }

      // 获取最后一次备份时间
      const history = await backupService.getBackupHistory(1);
      const lastBackup = history[0];
      
      if (lastBackup && lastBackup.timestamp) {
        const lastBackupTime = new Date(lastBackup.timestamp);
        const now = new Date();
        const hoursSinceLastBackup = (now - lastBackupTime) / (1000 * 60 * 60);
        
        if (hoursSinceLastBackup < settings.autoBackupInterval) {
          logger.info(`📅 Last backup was ${hoursSinceLastBackup.toFixed(4)} hours ago, next backup in ${(settings.autoBackupInterval - hoursSinceLastBackup).toFixed(4)} hours`);
          return;
        }
      }

      // 执行备份
      logger.info('📅 Starting scheduled backup...');
      const result = await backupService.createBackup();
      logger.success(`📅 Scheduled backup completed: ${result.id}`);
    } catch (error) {
      logger.error('❌ Scheduled backup failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // 停止定时任务
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('📅 Backup scheduler stopped');
    }
  }

  // 重启定时任务（设置更新后调用）
  async restart() {
    logger.info('📅 Restarting backup scheduler...');
    await this.start();
  }

  // 获取任务状态
  getStatus() {
    return {
      isScheduled: !!this.intervalId,
      isRunning: this.isRunning,
      checkInterval: this.checkInterval
    };
  }
}

module.exports = new BackupScheduler();
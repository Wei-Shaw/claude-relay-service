const CronJob = require('cron').CronJob;
const backupService = require('./backupService');
const logger = require('../utils/logger');

class BackupScheduler {
  constructor() {
    this.job = null;
    this.isRunning = false;
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

      // 计算cron表达式
      // 每天凌晨2点执行
      const cronExpression = '0 2 * * *';
      
      this.job = new CronJob(cronExpression, async () => {
        await this.checkAndRunBackup();
      }, null, true, 'Asia/Shanghai');

      logger.info(`📅 Backup scheduler started with interval: ${settings.autoBackupInterval} days`);
      
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
        const daysSinceLastBackup = Math.floor((now - lastBackupTime) / (1000 * 60 * 60 * 24));
        
        if (daysSinceLastBackup < settings.autoBackupInterval) {
          logger.info(`📅 Last backup was ${daysSinceLastBackup} days ago, next backup in ${settings.autoBackupInterval - daysSinceLastBackup} days`);
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
    if (this.job) {
      this.job.stop();
      this.job = null;
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
      isScheduled: !!this.job,
      isRunning: this.isRunning,
      nextRun: this.job ? this.job.nextDates(1)[0] : null
    };
  }
}

module.exports = new BackupScheduler();
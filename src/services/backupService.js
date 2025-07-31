const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');
const { createWriteStream, createReadStream } = require('fs');
const redis = require('../models/redis');
const logger = require('../utils/logger');

class BackupService {
  constructor() {
    // 默认备份路径 - 与init.json同级
    this.defaultBackupPath = path.join(process.cwd(), 'data', 'backups');
    // 临时文件路径
    this.tempPath = path.join(process.cwd(), 'temp');
    // 确保备份目录存在
    this.ensureDirectories();
  }

  async ensureDirectories() {
    try {
      const backupPath = await this.getBackupPath();
      await fs.mkdir(backupPath, { recursive: true });
      await fs.mkdir(this.tempPath, { recursive: true });
    } catch (error) {
      logger.error('❌ Failed to create directories:', error);
    }
  }

  // 获取备份路径（从Redis或使用默认值）
  async getBackupPath() {
    try {
      const client = redis.getClientSafe();
      const settings = await client.get('backup:settings');
      if (settings) {
        const parsedSettings = JSON.parse(settings);
        return parsedSettings.backupPath || this.defaultBackupPath;
      }
    } catch (error) {
      logger.warn('⚠️ Failed to get backup path from Redis, using default:', error.message);
    }
    return this.defaultBackupPath;
  }

  // 获取备份设置
  async getBackupSettings() {
    try {
      const client = redis.getClientSafe();
      const settings = await client.get('backup:settings');
      if (settings) {
        return JSON.parse(settings);
      }
    } catch (error) {
      logger.warn('⚠️ Failed to get backup settings:', error.message);
    }
    
    // 返回默认设置
    return {
      autoBackupEnabled: false,
      autoBackupInterval: 24, // 默认24小时
      backupPath: this.defaultBackupPath,
      maxBackups: 10 // 最多保留10个备份
    };
  }

  // 更新备份设置
  async updateBackupSettings(settings) {
    try {
      const client = redis.getClientSafe();
      
      // 验证备份路径
      if (settings.backupPath) {
        await fs.mkdir(settings.backupPath, { recursive: true });
        // 测试写入权限
        const testFile = path.join(settings.backupPath, '.test');
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
      }
      
      await client.set('backup:settings', JSON.stringify(settings));
      logger.info('✅ Backup settings updated successfully');
      return true;
    } catch (error) {
      logger.error('❌ Failed to update backup settings:', error);
      throw error;
    }
  }

  // 重置备份设置为默认值
  async resetBackupSettings() {
    try {
      const client = redis.getClientSafe();
      await client.del('backup:settings');
      logger.info('✅ Backup settings reset to defaults');
      return this.getBackupSettings(); // 返回默认设置
    } catch (error) {
      logger.error('❌ Failed to reset backup settings:', error);
      throw error;
    }
  }

  // 创建备份（JSON格式）
  async createBackup() {
    const startTime = Date.now();
    const backupId = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const tempDir = path.join(this.tempPath, backupId);
    
    try {
      logger.info(`📦 Starting backup: ${backupId}`);
      
      const client = redis.getClientSafe();
      const backupPath = await this.getBackupPath();
      
      // 创建临时目录
      await fs.mkdir(tempDir, { recursive: true });
      
      // 获取所有键
      const keys = await client.keys('*');
      logger.info(`📊 Found ${keys.length} keys to backup`);
      
      // 导出数据到JSON文件
      const data = {
        keys: []
      };
      
      let processedCount = 0;
      const batchSize = 100;
      
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        
        for (const key of batch) {
          try {
            const type = await client.type(key);
            const ttl = await client.ttl(key);
            
            let value;
            switch (type) {
              case 'string':
                value = await client.get(key);
                break;
              case 'hash':
                value = await client.hgetall(key);
                break;
              case 'list':
                value = await client.lrange(key, 0, -1);
                break;
              case 'set':
                value = await client.smembers(key);
                break;
              case 'zset': {
                // 兼容不同版本的 Redis 客户端
                let members;
                try {
                  // 新版本语法
                  members = await client.zrange(key, 0, -1, { WITHSCORES: true });
                } catch (err) {
                  // 旧版本语法
                  members = await client.zrange(key, 0, -1, 'WITHSCORES');
                }
                value = [];
                for (let j = 0; j < members.length; j += 2) {
                  value.push({ member: members[j], score: parseFloat(members[j + 1]) });
                }
                break;
              }
              default:
                logger.warn(`⚠️ Unsupported type ${type} for key ${key}`);
                continue;
            }
            
            data.keys.push({
              key,
              type,
              value,
              ttl: ttl > 0 ? ttl : -1
            });
            
            processedCount++;
          } catch (error) {
            logger.error(`❌ Failed to backup key ${key}:`, error.message);
          }
        }
        
        // 进度提示
        if (processedCount % 100 === 0) {
          logger.info(`📊 Progress: ${processedCount}/${keys.length} keys processed`);
        }
      }
      
      // 保存数据到JSON文件
      const dataPath = path.join(tempDir, 'data.json');
      await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
      
      // 创建元数据
      const metadata = {
        backupId,
        timestamp: new Date().toISOString(),
        version: '3.0',
        format: 'json',
        keysCount: data.keys.length,
        serviceName: 'Claude Relay Service',
        files: {
          'data.json': 'All Redis data in JSON format',
          'metadata.json': 'Backup metadata'
        }
      };
      
      // 保存元数据
      await fs.writeFile(
        path.join(tempDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );
      
      // 创建压缩包
      const zipPath = path.join(backupPath, `${backupId}.zip`);
      await this.createZipArchive(tempDir, zipPath);
      
      // 清理临时文件
      await fs.rm(tempDir, { recursive: true, force: true });
      
      // 获取文件信息
      const stat = await fs.stat(zipPath);
      const backupInfo = {
        id: backupId,
        fileName: `${backupId}.zip`,
        filePath: zipPath,
        timestamp: new Date().toISOString(),
        size: stat.size,
        keysCount: data.keys.length,
        duration: Date.now() - startTime,
        format: 'zip',
        version: '3.0'
      };
      
      logger.success(`✅ Backup completed: ${backupId} (${backupInfo.duration}ms)`);
      
      // 清理旧备份
      await this.cleanupOldBackups();
      
      return backupInfo;
    } catch (error) {
      // 清理临时文件
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        logger.warn('⚠️ Failed to cleanup temp files:', cleanupError.message);
      }
      
      logger.error(`❌ Backup failed: ${backupId}`, error);
      throw error;
    }
  }

  // 创建 ZIP 压缩包
  async createZipArchive(sourceDir, destPath) {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(destPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // 最高压缩级别
      });

      output.on('close', () => {
        logger.info(`📦 Archive created: ${archive.pointer()} bytes`);
        resolve();
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  // 获取备份历史（扫描目录）
  async getBackupHistory(limit = 20) {
    try {
      const backupPath = await this.getBackupPath();
      const backups = [];
      
      // 确保备份目录存在
      await fs.mkdir(backupPath, { recursive: true });
      
      // 读取目录中的所有文件
      const files = await fs.readdir(backupPath);
      
      // 过滤出备份文件
      const backupFiles = files.filter(file => file.startsWith('backup_') && file.endsWith('.zip'));
      
      // 获取每个备份文件的信息
      for (const fileName of backupFiles) {
        try {
          const filePath = path.join(backupPath, fileName);
          const stat = await fs.stat(filePath);
          
          // 从文件名提取备份ID和时间戳
          const id = fileName.replace('.zip', '');
          // backup_2025-07-31T08-13-18-066Z -> 2025-07-31T08:13:18.066Z
          const timestampMatch = id.match(/backup_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
          if (!timestampMatch) continue;
          
          const timestamp = timestampMatch[1].replace(/-(\d{2})-(\d{2})-(\d{3}Z)$/, ':$1:$2.$3');
          
          const backupInfo = {
            id: id,
            fileName: fileName,
            filePath: filePath,
            timestamp: timestamp,
            size: stat.size,
            keysCount: 0, // 无法从文件名获取，设为0
            exists: true,
            format: 'zip',
            version: '3.0'
          };
          
          backups.push(backupInfo);
        } catch (error) {
          logger.warn(`⚠️ Failed to read backup file ${fileName}:`, error.message);
        }
      }
      
      // 按时间戳降序排序（最新的在前）
      backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      // 限制返回数量
      return backups.slice(0, limit);
    } catch (error) {
      logger.error('❌ Failed to get backup history:', error);
      return [];
    }
  }

  // 还原备份
  async restoreBackup(backupId) {
    const startTime = Date.now();
    const tempDir = path.join(this.tempPath, `restore_${backupId}`);
    
    try {
      logger.info(`🔄 Starting restore: ${backupId}`);
      
      const backupPath = await this.getBackupPath();
      const zipPath = path.join(backupPath, `${backupId}.zip`);
      
      // 检查备份文件是否存在
      await fs.access(zipPath);
      
      // 创建临时目录
      await fs.mkdir(tempDir, { recursive: true });
      
      // 解压备份文件
      await this.extractZipArchive(zipPath, tempDir);
      
      // 读取元数据
      const metadataPath = path.join(tempDir, 'metadata.json');
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      
      logger.info(`📊 Restoring backup version ${metadata.version}, format: ${metadata.format}`);
      
      // 根据版本选择还原方法
      let restoredCount;
      if (metadata.format === 'json' && metadata.version === '3.0') {
        restoredCount = await this.restoreFromJSON(tempDir);
      } else if (metadata.format === 'rdb') {
        // 对于RDB格式，我们需要转换为JSON格式再还原
        throw new Error('RDB format restore requires manual Redis restart. Please use JSON format backups.');
      } else {
        throw new Error(`Unsupported backup format: ${metadata.format} v${metadata.version}`);
      }
      
      // 清理临时文件
      await fs.rm(tempDir, { recursive: true, force: true });
      
      const duration = Date.now() - startTime;
      logger.success(`✅ Restore completed: ${backupId} (${duration}ms)`);
      
      return {
        backupId,
        restoredKeys: restoredCount,
        duration
      };
    } catch (error) {
      // 清理临时文件
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        logger.warn('⚠️ Failed to cleanup temp files:', cleanupError.message);
      }
      
      logger.error(`❌ Restore failed: ${backupId}`, error);
      throw error;
    }
  }

  // 从JSON还原数据
  async restoreFromJSON(tempDir) {
    const client = redis.getClientSafe();
    
    try {
      // 读取数据文件
      const dataPath = path.join(tempDir, 'data.json');
      const dataContent = await fs.readFile(dataPath, 'utf8');
      const data = JSON.parse(dataContent);
      
      if (!data.keys || !Array.isArray(data.keys)) {
        throw new Error('Invalid backup data format');
      }
      
      logger.info(`📊 Found ${data.keys.length} keys to restore`);
      
      // 保存重要数据
      logger.info('📦 Saving important data before restore...');
      const backupSettings = await client.get('backup:settings');
      
      // 清空数据库
      logger.info('🧹 Clearing current database...');
      await client.flushdb();
      
      // 还原数据
      let restoredCount = 0;
      const batchSize = 100;
      
      for (let i = 0; i < data.keys.length; i += batchSize) {
        const batch = data.keys.slice(i, i + batchSize);
        
        for (const item of batch) {
          try {
            const { key, type, value, ttl } = item;
            
            switch (type) {
              case 'string':
                await client.set(key, value);
                break;
              case 'hash':
                if (Object.keys(value).length > 0) {
                  await client.hset(key, value);
                }
                break;
              case 'list':
                if (value.length > 0) {
                  await client.rpush(key, ...value);
                }
                break;
              case 'set':
                if (value.length > 0) {
                  await client.sadd(key, ...value);
                }
                break;
              case 'zset':
                if (value.length > 0) {
                  const zsetData = [];
                  for (const item of value) {
                    zsetData.push(item.score, item.member);
                  }
                  await client.zadd(key, ...zsetData);
                }
                break;
              default:
                logger.warn(`⚠️ Unsupported type ${type} for key ${key}`);
                continue;
            }
            
            // 设置TTL
            if (ttl > 0) {
              await client.expire(key, ttl);
            }
            
            restoredCount++;
          } catch (error) {
            logger.error(`❌ Failed to restore key ${item.key}:`, error.message);
          }
        }
        
        // 进度提示
        if (restoredCount % 100 === 0) {
          logger.info(`🔄 Progress: ${restoredCount}/${data.keys.length} keys restored`);
        }
      }
      
      // 恢复重要数据
      logger.info('📋 Restoring backup settings...');
      if (backupSettings) {
        await client.set('backup:settings', backupSettings);
      }
      
      // 验证数据
      const keys = await client.keys('*');
      logger.info(`📊 Restored data stats: ${keys.length} keys`);
      
      // 统计不同类型的键
      const apiKeys = keys.filter(k => k.startsWith('api_key:')).length;
      const apiKeyHashes = keys.filter(k => k.startsWith('api_key_hash:')).length;
      const claudeAccounts = keys.filter(k => k.startsWith('claude_account:')).length;
      const geminiAccounts = keys.filter(k => k.startsWith('gemini_account:')).length;
      const usage = keys.filter(k => k.startsWith('usage:')).length;
      const admins = keys.filter(k => k.startsWith('admin:')).length;
      
      logger.info(`  - API Keys: ${apiKeys}`);
      logger.info(`  - API Key Hashes: ${apiKeyHashes}`);
      logger.info(`  - Claude Accounts: ${claudeAccounts}`);
      logger.info(`  - Gemini Accounts: ${geminiAccounts}`);
      logger.info(`  - Admins: ${admins}`);
      logger.info(`  - Usage Records: ${usage}`);
      
      logger.success(`✅ Restored ${restoredCount} keys successfully!`);
      
      return restoredCount;
    } catch (error) {
      logger.error('❌ JSON restore failed:', error);
      throw error;
    }
  }

  // 解压 ZIP 文件
  async extractZipArchive(zipPath, destDir) {
    const unzipper = require('unzipper');
    
    return new Promise((resolve, reject) => {
      createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: destDir }))
        .on('close', resolve)
        .on('error', reject);
    });
  }

  // 删除备份
  async deleteBackup(backupId) {
    try {
      const backupPath = await this.getBackupPath();
      const fileName = `${backupId}.zip`;
      const filePath = path.join(backupPath, fileName);
      
      // 删除zip文件
      try {
        await fs.access(filePath);
        await fs.unlink(filePath);
        logger.info(`🗑️ Deleted backup: ${fileName}`);
      } catch (error) {
        logger.warn(`⚠️ Backup file not found: ${fileName}`);
        // 文件不存在时不抛出错误，只记录警告
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error(`❌ Failed to delete backup ${backupId}:`, error);
      throw error;
    }
  }

  // 清理旧备份
  async cleanupOldBackups() {
    try {
      const settings = await this.getBackupSettings();
      const maxBackups = settings.maxBackups || 10;
      
      const history = await this.getBackupHistory(1000);
      const validBackups = history.filter(b => b.exists);
      
      if (validBackups.length > maxBackups) {
        const toDelete = validBackups.slice(maxBackups);
        for (const backup of toDelete) {
          try {
            await this.deleteBackup(backup.id);
          } catch (error) {
            logger.warn(`⚠️ Failed to cleanup old backup ${backup.id}:`, error.message);
          }
        }
      }
    } catch (error) {
      logger.error('❌ Failed to cleanup old backups:', error);
    }
  }

  // 获取备份文件路径
  async getBackupFilePath(backupId) {
    const backupPath = await this.getBackupPath();
    const fileName = `${backupId}.zip`;
    const filePath = path.join(backupPath, fileName);
    
    // 检查文件是否存在
    await fs.access(filePath);
    return filePath;
  }

  // 导入外部备份文件
  async importBackup(filePath, options = {}) {
    const tempDir = path.join(this.tempPath, `import_${Date.now()}`);
    
    try {
      logger.info(`📥 Importing backup from: ${filePath}`);
      
      // 创建临时目录
      await fs.mkdir(tempDir, { recursive: true });
      
      // 解压备份文件到临时目录
      await this.extractZipArchive(filePath, tempDir);
      
      // 读取并验证元数据
      const metadataPath = path.join(tempDir, 'metadata.json');
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      
      // 验证备份格式
      if (!metadata.format || !metadata.version) {
        throw new Error('Invalid backup format: missing metadata');
      }
      
      // 生成新的备份ID（使用原始时间戳）
      const importedBackupId = `backup_${new Date(metadata.timestamp).toISOString().replace(/[:.]/g, '-')}`;
      
      // 复制到备份目录
      const backupPath = await this.getBackupPath();
      const destPath = path.join(backupPath, `${importedBackupId}.zip`);
      await fs.copyFile(filePath, destPath);
      
      // 创建备份信息（仅用于返回）
      const stat = await fs.stat(destPath);
      const backupInfo = {
        id: importedBackupId,
        fileName: `${importedBackupId}.zip`,
        filePath: destPath,
        timestamp: metadata.timestamp,
        size: stat.size,
        keysCount: metadata.keysCount,
        duration: 0,
        format: 'zip',
        version: metadata.version,
        imported: true,
        importedAt: new Date().toISOString()
      };
      
      // 清理临时文件
      await fs.rm(tempDir, { recursive: true, force: true });
      
      logger.success(`✅ Backup imported successfully: ${importedBackupId}`);
      
      // 如果选项中指定了立即还原
      if (options.restore) {
        logger.info('🔄 Restoring imported backup...');
        await this.restoreBackup(importedBackupId);
      }
      
      return {
        ...backupInfo,
        metadata
      };
    } catch (error) {
      // 清理临时文件
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        logger.warn('⚠️ Failed to cleanup temp files:', cleanupError.message);
      }
      
      logger.error('❌ Failed to import backup:', error);
      throw error;
    }
  }

  // 验证备份文件（不导入）
  async validateBackupFile(filePath) {
    const tempDir = path.join(this.tempPath, `validate_${Date.now()}`);
    
    try {
      // 创建临时目录
      await fs.mkdir(tempDir, { recursive: true });
      
      // 解压备份文件
      await this.extractZipArchive(filePath, tempDir);
      
      // 读取元数据
      const metadataPath = path.join(tempDir, 'metadata.json');
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      
      // 验证必要文件
      if (metadata.format === 'json') {
        const dataPath = path.join(tempDir, 'data.json');
        await fs.access(dataPath);
      } else if (metadata.format === 'rdb') {
        const rdbPath = path.join(tempDir, 'redis.rdb');
        await fs.access(rdbPath);
      }
      
      // 清理临时文件
      await fs.rm(tempDir, { recursive: true, force: true });
      
      return {
        valid: true,
        metadata
      };
    } catch (error) {
      // 清理临时文件
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        // 忽略清理错误
      }
      
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = new BackupService();
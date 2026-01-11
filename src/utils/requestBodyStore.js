/**
 * 请求体存储管理器
 * 小请求：内存存储
 * 大请求：临时文件存储
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// 阈值：超过此大小使用文件存储 (1MB)
const FILE_THRESHOLD = 1024 * 1024;

// 临时目录
const TEMP_DIR = path.join(os.tmpdir(), 'claude-relay-body');

// 活跃的文件存储
const activeFiles = new Map();

// 确保临时目录存在
let tempDirReady = false;
async function ensureTempDir() {
  if (tempDirReady) return;
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    tempDirReady = true;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    tempDirReady = true;
  }
}

/**
 * 存储请求体字符串
 * @param {string} bodyString - JSON 字符串
 * @returns {Promise<{id: string, size: number, inMemory: boolean}>}
 */
async function store(bodyString) {
  const size = Buffer.byteLength(bodyString, 'utf8');
  const id = crypto.randomBytes(8).toString('hex');
  
  if (size < FILE_THRESHOLD) {
    // 小请求：内存存储
    activeFiles.set(id, { type: 'memory', data: bodyString, size });
    return { id, size, inMemory: true };
  }
  
  // 大请求：文件存储
  await ensureTempDir();
  const filePath = path.join(TEMP_DIR, 'body-' + id + '.json');
  await fs.writeFile(filePath, bodyString, 'utf8');
  activeFiles.set(id, { type: 'file', path: filePath, size });
  
  return { id, size, inMemory: false };
}

/**
 * 读取请求体
 * @param {string} id - 存储 ID
 * @returns {Promise<string|null>}
 */
async function retrieve(id) {
  const entry = activeFiles.get(id);
  if (!entry) return null;
  
  if (entry.type === 'memory') {
    return entry.data;
  }
  
  try {
    return await fs.readFile(entry.path, 'utf8');
  } catch (err) {
    console.error('Failed to read body file ' + entry.path + ':', err.message);
    return null;
  }
}

/**
 * 释放存储
 * @param {string} id - 存储 ID
 */
async function release(id) {
  const entry = activeFiles.get(id);
  if (!entry) return;
  
  activeFiles.delete(id);
  
  if (entry.type === 'file') {
    try {
      await fs.unlink(entry.path);
    } catch (err) {
      // 忽略删除失败
    }
  }
}

/**
 * 获取统计信息
 */
function getStats() {
  let memoryCount = 0, fileCount = 0;
  let memorySize = 0, fileSize = 0;
  
  for (const entry of activeFiles.values()) {
    if (entry.type === 'memory') {
      memoryCount++;
      memorySize += entry.size;
    } else {
      fileCount++;
      fileSize += entry.size;
    }
  }
  
  return {
    memoryEntries: memoryCount,
    fileEntries: fileCount,
    memorySize,
    fileSize,
    totalEntries: memoryCount + fileCount
  };
}

/**
 * 清理所有临时文件
 */
async function cleanup() {
  for (const [id, entry] of activeFiles) {
    if (entry.type === 'file') {
      try {
        await fs.unlink(entry.path);
      } catch {}
    }
  }
  activeFiles.clear();
}

module.exports = {
  store,
  retrieve,
  release,
  getStats,
  cleanup,
  FILE_THRESHOLD
};

/**
 * 请求体存储管理器
 * 
 * 架构说明：
 * - 小请求（<1MB）: 内存存储为字符串
 * - 大请求（>=1MB）: 临时文件存储
 * 
 * 使用场景：
 * 1. 调用者在请求开始时调用 store() 存储 body 字符串
 * 2. 将 bodyStoreId 传递给下游处理函数
 * 3. 下游函数在需要时调用 retrieve() 获取字符串
 * 4. 请求完成后（无论成功/失败）调用 release() 清理
 */

const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// 阈值：超过此大小使用文件存储 (1MB)
const FILE_THRESHOLD = 1024 * 1024;

// 临时目录
const TEMP_DIR = path.join(os.tmpdir(), "claude-relay-body");

// 活跃的文件存储 Map<id, {type, data?, path?, size, refCount}>
const activeFiles = new Map();

// 确保临时目录存在
let tempDirReady = false;
async function ensureTempDir() {
  if (tempDirReady) return;
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true, mode: 0o755 });
    tempDirReady = true;
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    tempDirReady = true;
  }
}

/**
 * 清理孤儿文件（启动时调用）
 */
async function cleanupOrphanFiles() {
  try {
    await ensureTempDir();
    const files = await fs.readdir(TEMP_DIR);
    if (files.length > 0) {
      console.log(`[requestBodyStore] Cleaning up ${files.length} orphaned temp files`);
      for (const file of files) {
        if (file.startsWith("body-") && file.endsWith(".json")) {
          const filePath = path.join(TEMP_DIR, file);
          try {
            await fs.unlink(filePath);
          } catch (err) {
            if (err.code !== "ENOENT") {
              console.error(`[requestBodyStore] Failed to cleanup orphan file ${file}:`, err.message);
            }
          }
        }
      }
    }
  } catch (err) {
    // 目录不存在或其他错误，忽略
    if (err.code !== "ENOENT") {
      console.error("[requestBodyStore] Cleanup error:", err.message);
    }
  }
}

/**
 * 存储请求体字符串
 * @param {string} bodyString - JSON 字符串
 * @returns {Promise<{id: string, size: number, inMemory: boolean}>}
 */
async function store(bodyString) {
  const size = Buffer.byteLength(bodyString, "utf8");
  const id = crypto.randomBytes(8).toString("hex");

  if (size < FILE_THRESHOLD) {
    // 小请求：内存存储
    activeFiles.set(id, { type: "memory", data: bodyString, size, refCount: 1 });
    return { id, size, inMemory: true };
  }

  // 大请求：文件存储
  await ensureTempDir();
  const filePath = path.join(TEMP_DIR, "body-" + id + ".json");
  await fs.writeFile(filePath, bodyString, { encoding: "utf8", mode: 0o600 });
  activeFiles.set(id, { type: "file", path: filePath, size, refCount: 1 });

  return { id, size, inMemory: false };
}

/**
 * 读取请求体
 * @param {string} id - 存储 ID
 * @returns {Promise<string|null>}
 */
async function retrieve(id) {
  const entry = activeFiles.get(id);
  if (!entry) {
    console.error(`[requestBodyStore] Retrieve: ID not found: ${id}`);
    return null;
  }

  if (entry.type === "memory") {
    return entry.data;
  }

  // 文件存储
  try {
    return await fs.readFile(entry.path, "utf8");
  } catch (err) {
    console.error(`[requestBodyStore] Failed to read file ${entry.path}:`, err.message);
    return null;
  }
}

/**
 * 释放存储
 * @param {string} id - 存储 ID
 */
async function release(id) {
  const entry = activeFiles.get(id);
  if (!entry) {
    // 可能已经被释放过了，静默返回
    return;
  }

  // 引用计数递减
  entry.refCount--;
  if (entry.refCount > 0) {
    return; // 还有其他引用
  }

  activeFiles.delete(id);

  if (entry.type === "file") {
    try {
      await fs.unlink(entry.path);
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.error(`[requestBodyStore] Failed to delete temp file ${entry.path}:`, err.message);
      }
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
    if (entry.type === "memory") {
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
 * 清理所有临时文件（优雅关闭时调用）
 */
async function cleanup() {
  const promises = [];
  for (const [id, entry] of activeFiles) {
    if (entry.type === "file") {
      promises.push(
        fs.unlink(entry.path).catch((err) => {
          if (err.code !== "ENOENT") {
            console.error(`[requestBodyStore] Cleanup failed for ${entry.path}:`, err.message);
          }
        })
      );
    }
  }
  await Promise.all(promises);
  activeFiles.clear();
}

module.exports = {
  store,
  retrieve,
  release,
  getStats,
  cleanup,
  cleanupOrphanFiles,
  FILE_THRESHOLD
};

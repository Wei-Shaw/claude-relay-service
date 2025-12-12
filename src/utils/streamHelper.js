/**
 * Stream Helper Utilities
 * 流处理辅助工具函数
 */

/**
 * 检查响应流是否仍然可写（客户端连接是否有效）
 * @param {import('http').ServerResponse} stream - HTTP响应流
 * @returns {boolean} 如果流可写返回true，否则返回false
 */
function isStreamWritable(stream) {
  if (!stream) {
    return false
  }

  // 检查流是否已销毁
  if (stream.destroyed) {
    return false
  }

  // 检查底层socket是否已销毁
  if (stream.socket?.destroyed) {
    return false
  }

  // 检查流是否已结束写入
  if (stream.writableEnded) {
    return false
  }

  return true
}

module.exports = {
  isStreamWritable
}

/**
 * 统计计算工具函数
 * 提供百分位数计算、等待时间统计等通用统计功能
 */

/**
 * 计算百分位数（使用 nearest-rank 方法）
 * @param {number[]} sortedArray - 已排序的数组（升序）
 * @param {number} percentile - 百分位数 (0-100)
 * @returns {number} 百分位值
 *
 * 边界情况说明：
 * - percentile=0: 返回最小值 (index=0)
 * - percentile=100: 返回最大值 (index=len-1)
 * - percentile=50 且 len=2: 返回第一个元素（nearest-rank 向下取）
 *
 * 算法说明（nearest-rank 方法）：
 * - index = ceil(percentile / 100 * len) - 1
 * - 示例：len=100, P50 → ceil(50) - 1 = 49（第50个元素，0-indexed）
 * - 示例：len=100, P99 → ceil(99) - 1 = 98（第99个元素）
 */
function getPercentile(sortedArray, percentile) {
  const len = sortedArray.length
  if (len === 0) {
    return 0
  }
  if (len === 1) {
    return sortedArray[0]
  }

  // 边界处理：percentile <= 0 返回最小值
  if (percentile <= 0) {
    return sortedArray[0]
  }
  // 边界处理：percentile >= 100 返回最大值
  if (percentile >= 100) {
    return sortedArray[len - 1]
  }

  const index = Math.ceil((percentile / 100) * len) - 1
  return sortedArray[index]
}

/**
 * 计算等待时间分布统计
 * @param {number[]} waitTimes - 等待时间数组（无需预先排序）
 * @returns {Object|null} 统计对象，空数组返回 null
 *
 * 返回对象包含：
 * - sampleCount: 样本数量（始终包含，便于调用方判断可靠性）
 * - count: 样本数量（向后兼容）
 * - min: 最小值
 * - max: 最大值
 * - avg: 平均值（四舍五入）
 * - p50: 50百分位数（中位数）
 * - p90: 90百分位数
 * - p99: 99百分位数
 * - sampleSizeWarning: 样本量不足时的警告信息（样本 < 10）
 * - p90Unreliable: P90 统计不可靠标记（样本 < 10）
 * - p99Unreliable: P99 统计不可靠标记（样本 < 100）
 *
 * 可靠性标记说明（详见 design.md Decision 6）：
 * - 样本 < 10: P90 和 P99 都不可靠
 * - 样本 < 100: P99 不可靠（P90 需要 10 个样本，P99 需要 100 个样本）
 * - 即使标记为不可靠，仍返回计算值供参考
 */
function calculateWaitTimeStats(waitTimes) {
  if (!waitTimes || waitTimes.length === 0) {
    return null
  }

  const sorted = [...waitTimes].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  const len = sorted.length

  const stats = {
    sampleCount: len, // 新增：始终包含样本数
    count: len, // 向后兼容
    min: sorted[0],
    max: sorted[len - 1],
    avg: Math.round(sum / len),
    p50: getPercentile(sorted, 50),
    p90: getPercentile(sorted, 90),
    p99: getPercentile(sorted, 99)
  }

  // 渐进式可靠性标记（详见 design.md Decision 6）
  // 样本 < 10: P90 不可靠（P90 至少需要 ceil(100/10) = 10 个样本）
  if (len < 10) {
    stats.sampleSizeWarning = 'Results may be inaccurate due to small sample size'
    stats.p90Unreliable = true
  }

  // 样本 < 100: P99 不可靠（P99 至少需要 ceil(100/1) = 100 个样本）
  if (len < 100) {
    stats.p99Unreliable = true
  }

  return stats
}

module.exports = {
  getPercentile,
  calculateWaitTimeStats
}

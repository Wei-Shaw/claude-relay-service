// 兼容层:usage 统计的 token 字段旧格式标准化
//
// 来源:src/models/redis.js
//   - normalizeKeyTokenStats   = getUsageStats 内 handleLegacyData(收拢前 L1720),函数体逐字搬迁
//   - normalizeAccountTokenStats = getAccountUsageStats 内 handleAccountData(收拢前 L2225),函数体逐字搬迁
// 收拢日期:2026-06-03
// 原始语义:旧数据只有单一 totalTokens/tokens 字段,新数据分离 input/output/cache。两者差异 **不可合并**:
//   - Key 维度(normalizeKeyTokenStats):旧单字段按 30% input / 70% output 拆分,allTokens=tokens
//   - 账户维度(normalizeAccountTokenStats):旧单字段 **不拆分**,input/output 保持 0,tokens 取原值
//   tests/compat/tokenStats.test.js 与 tests/compat/tokenStatsGolden.test.js 用同批 case 钉死这一差异。
// 下线条件:确认 Redis 中所有 usage 数据均已写入分离字段(无裸 totalTokens 的旧数据)后,
//   可移除 30/70 拆分分支与 tokens/totalTokens 兜底。

// API Key 维度:旧单字段按 30/70 拆 input/output
const normalizeKeyTokenStats = (data) => {
  // 优先使用total*字段（存储时使用的字段）
  const tokens = parseInt(data.totalTokens) || parseInt(data.tokens) || 0
  const inputTokens = parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0
  const outputTokens = parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0
  const requests = parseInt(data.totalRequests) || parseInt(data.requests) || 0

  // 新增缓存token字段
  const cacheCreateTokens =
    parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0
  const cacheReadTokens = parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0
  const allTokens = parseInt(data.totalAllTokens) || parseInt(data.allTokens) || 0

  const totalFromSeparate = inputTokens + outputTokens
  // 计算实际的总tokens（包含所有类型）
  const actualAllTokens =
    allTokens || inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

  if (totalFromSeparate === 0 && tokens > 0) {
    // 旧数据：没有输入输出分离
    return {
      tokens, // 保持兼容性，但统一使用allTokens
      inputTokens: Math.round(tokens * 0.3), // 假设30%为输入
      outputTokens: Math.round(tokens * 0.7), // 假设70%为输出
      cacheCreateTokens: 0, // 旧数据没有缓存token
      cacheReadTokens: 0,
      allTokens: tokens, // 对于旧数据，allTokens等于tokens
      requests
    }
  } else {
    // 新数据或无数据 - 统一使用allTokens作为tokens的值
    return {
      tokens: actualAllTokens, // 统一使用allTokens作为总数
      inputTokens,
      outputTokens,
      cacheCreateTokens,
      cacheReadTokens,
      allTokens: actualAllTokens,
      requests
    }
  }
}

// 账户维度:旧单字段不拆分,tokens 取原值
const normalizeAccountTokenStats = (data) => {
  const tokens = parseInt(data.totalTokens) || parseInt(data.tokens) || 0
  const inputTokens = parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0
  const outputTokens = parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0
  const requests = parseInt(data.totalRequests) || parseInt(data.requests) || 0
  const cacheCreateTokens =
    parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0
  const cacheReadTokens = parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0
  const allTokens = parseInt(data.totalAllTokens) || parseInt(data.allTokens) || 0

  const actualAllTokens =
    allTokens || inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

  return {
    tokens,
    inputTokens,
    outputTokens,
    cacheCreateTokens,
    cacheReadTokens,
    allTokens: actualAllTokens,
    requests
  }
}

module.exports = { normalizeKeyTokenStats, normalizeAccountTokenStats }

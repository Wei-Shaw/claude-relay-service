/**
 * 🧮 Anthropic 统一限流响应头解析
 *
 * 上游会在每个响应里回传多个「限流窗口」的独立状态：
 *
 *   anthropic-ratelimit-unified-5h-{status,reset,utilization}      账号级 5 小时窗口
 *   anthropic-ratelimit-unified-7d-{status,reset,utilization}      账号级 7 天窗口
 *   anthropic-ratelimit-unified-7d_oi-{status,reset,utilization}   Opus 专属 7 天窗口
 *   anthropic-ratelimit-unified-representative-claim               当前「代表窗口」(five_hour / seven_day)
 *   anthropic-ratelimit-unified-status                             代表窗口的状态
 *   anthropic-ratelimit-unified-reset                              代表窗口的 reset —— 会漂移！
 *
 * ⚠️ 关键点：`anthropic-ratelimit-unified-reset` 不是某个模型家族的 reset，
 * 它只是 representative-claim 当前指向的那个窗口的 reset。当代表窗口是 7d 时，
 * 一次「5h 窗口被打满」引发的 429 会被记成「该模型家族限流到一周之后」，
 * 于是这个账号的该模型被白白停掉好几天 —— 即使账号周用量只有个位数百分比。
 *
 * 因此判断限流时长必须先看「哪个窗口 status === rejected」，用那个窗口自己的 reset；
 * 只有在上游没给出可用的窗口信息时，才退回 unified-reset，并由调用方钳制上限。
 */

const logger = require('./logger')

// 上游会回传的窗口后缀。7d_oi = seven day opus intensive（Opus 专属周窗口）
const RATE_LIMIT_WINDOW_KEYS = ['5h', '7d', '7d_oi']

// 窗口 → 模型家族。只有 Opus 专属周窗口是真正「按模型」的，
// 5h / 7d 是整个账号共享的窗口，不隶属于任何单一模型家族。
const WINDOW_MODEL_FAMILY = {
  '7d_oi': 'opus'
}

// 被拒绝的窗口状态。上游取值：allowed / allowed_warning / rejected
const REJECTED_STATUS = 'rejected'

// 兜底时长上限（秒）。仅在无法识别「哪个窗口被拒绝」时生效。
const DEFAULT_MAX_FALLBACK_SECONDS = 3600

/**
 * 大小写不敏感地读取响应头。Node 的 http 会把头名转成小写，
 * 但经过代理/改写后不一定，这里统一兜一层。
 */
function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') {
    return undefined
  }
  if (headers[name] !== undefined) {
    return headers[name]
  }
  const lower = name.toLowerCase()
  if (headers[lower] !== undefined) {
    return headers[lower]
  }
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      return headers[key]
    }
  }
  return undefined
}

function parseTimestamp(value) {
  if (value === undefined || value === null || value === '') {
    return null
  }
  const raw = String(value).trim()

  // 绝大多数情况下是 Unix 秒。必须先确认整串都是数字：
  // parseInt('2026-09-05T06:10:00Z') 会返回 2026，把 ISO 时间误读成一个 1970 年的时间戳。
  if (/^\d+$/.test(raw)) {
    const seconds = parseInt(raw, 10)
    return seconds > 0 ? seconds : null
  }

  // 兼容 ISO 时间格式
  const date = new Date(raw)
  if (!Number.isNaN(date.getTime())) {
    return Math.floor(date.getTime() / 1000)
  }
  return null
}

function parseUtilization(value) {
  if (value === undefined || value === null || value === '') {
    return null
  }
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * 解析所有限流窗口。
 * @param {object} headers - 上游响应头
 * @returns {Array<{key:string, status:string|null, reset:number|null, utilization:number|null, family:string|null, isAccountWide:boolean}>}
 */
function parseRateLimitWindows(headers) {
  return RATE_LIMIT_WINDOW_KEYS.map((key) => {
    const status = getHeader(headers, `anthropic-ratelimit-unified-${key}-status`)
    const family = WINDOW_MODEL_FAMILY[key] || null
    return {
      key,
      status: status ? String(status).toLowerCase() : null,
      reset: parseTimestamp(getHeader(headers, `anthropic-ratelimit-unified-${key}-reset`)),
      utilization: parseUtilization(
        getHeader(headers, `anthropic-ratelimit-unified-${key}-utilization`)
      ),
      family,
      isAccountWide: family === null
    }
  }).filter((w) => w.status !== null || w.reset !== null)
}

/**
 * 解析一次 429 应该使用的 reset 时间戳。
 *
 * 优先级：
 *   1. 与请求模型家族匹配、且 status=rejected 的模型级窗口（如 Opus 的 7d_oi）
 *   2. status=rejected 的账号级窗口（5h / 7d），取最晚的那个 —— 只有它们全部
 *      恢复后账号才真正可用
 *   3. 兜底：代表窗口的 unified-reset，并按 maxFallbackSeconds 钳制
 *
 * @param {object} headers - 上游响应头
 * @param {string|null} modelFamily - 请求模型所属家族（opus/sonnet/haiku/fable）
 * @param {object} [options]
 * @param {number} [options.maxFallbackSeconds] - 兜底路径的最大时长（秒）
 * @param {number} [options.now] - 当前时间戳（毫秒），便于测试
 * @returns {{resetTimestamp:number|null, windowKey:string|null, scope:'model'|'account'|null, authoritative:boolean, clamped:boolean}}
 */
function resolveRateLimitReset(headers, modelFamily = null, options = {}) {
  const maxFallbackSeconds = Number.isFinite(options.maxFallbackSeconds)
    ? options.maxFallbackSeconds
    : DEFAULT_MAX_FALLBACK_SECONDS
  const now = options.now || Date.now()

  const windows = parseRateLimitWindows(headers)
  const rejected = windows.filter((w) => w.status === REJECTED_STATUS && w.reset !== null)

  // 1) 模型级窗口被拒绝，且正是本次请求的模型家族 —— 这是最精确的信息
  if (modelFamily) {
    const modelWindow = rejected.find((w) => w.family === modelFamily)
    if (modelWindow) {
      return {
        resetTimestamp: modelWindow.reset,
        windowKey: modelWindow.key,
        scope: 'model',
        authoritative: true,
        clamped: false
      }
    }
  }

  // 2) 账号级窗口被拒绝 —— 取最晚的 reset，因为要全部恢复账号才可用
  const accountWindows = rejected.filter((w) => w.isAccountWide)
  if (accountWindows.length > 0) {
    const latest = accountWindows.reduce((a, b) => (b.reset > a.reset ? b : a))
    return {
      resetTimestamp: latest.reset,
      windowKey: latest.key,
      scope: 'account',
      authoritative: true,
      clamped: false
    }
  }

  // 3) 兜底：只能用代表窗口的 reset，但它可能指向一周之后，必须钳制。
  //    最坏情况是每 maxFallbackSeconds 多试一次（代价是一个 429），
  //    远好于把某个模型在这个账号上误停数天。
  const fallback = parseTimestamp(getHeader(headers, 'anthropic-ratelimit-unified-reset'))
  if (fallback === null) {
    return {
      resetTimestamp: null,
      windowKey: null,
      scope: null,
      authoritative: false,
      clamped: false
    }
  }

  const capTimestamp = Math.floor(now / 1000) + maxFallbackSeconds
  if (fallback > capTimestamp) {
    logger.warn(
      `⏱️ Unified reset ${new Date(fallback * 1000).toISOString()} exceeds the ${maxFallbackSeconds}s fallback cap ` +
        `(no rejected window reported); clamping to ${new Date(capTimestamp * 1000).toISOString()}`
    )
    return {
      resetTimestamp: capTimestamp,
      windowKey: null,
      scope: modelFamily ? 'model' : 'account',
      authoritative: false,
      clamped: true
    }
  }

  return {
    resetTimestamp: fallback,
    windowKey: null,
    scope: modelFamily ? 'model' : 'account',
    authoritative: false,
    clamped: false
  }
}

module.exports = {
  RATE_LIMIT_WINDOW_KEYS,
  WINDOW_MODEL_FAMILY,
  DEFAULT_MAX_FALLBACK_SECONDS,
  parseRateLimitWindows,
  resolveRateLimitReset
}

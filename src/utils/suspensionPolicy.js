// disableAutoProtection 开关 + 账户可调度判定的领域纯函数
// 纯函数：输入数据 → 输出结果，不碰 Redis/HTTP/IO，由 service 组合调用
//
// 设计决策（详见对话记录）：
// - 一个开关 disableAutoProtection：开启时账户不被上游错误自动暂停
// - 按账户能力区分行为：能刷 token 的(oauth) token 失效走短冷却自愈；不能刷的(apikey) 全暴力透传
// - 两条底线开关永不覆盖：手动停用(isActive/manualUnschedulable)、每日预算(budgetExceeded，仅 API-Key 类)
// - 判定点拦截：开关开时 isSchedulable 忽略一切自动暂停（含历史残留），根治"历史 error 卡死"

// 受 disableAutoProtection 管的"上游错误类" reason（对齐 classifyError 返回值 + 窗口/周限/刷新失败）
const UPSTREAM_REASONS = new Set([
  'rate_limit',
  'overload',
  'service_unavailable',
  'timeout',
  'auth_error',
  'server_error',
  'five_hour_limit',
  'opus_weekly_limit',
  'token_refresh_failed'
])

// token 失效类：能刷 token 的账户开关开时走"短冷却自愈"（给后台刷新留窗口），而非暴力透传
const TOKEN_FAILURE_REASONS = new Set(['auth_error', 'token_refresh_failed'])

const isUpstreamReason = (reason) => UPSTREAM_REASONS.has(reason)

// 开关开启时遇到某个上游错误该如何处理：
//   'suspend'        正常暂停（开关关，或非上游错误）
//   'short_cooldown' 短冷却自愈（能刷 token 的账户遇 token 失效，留刷新窗口）
//   'passthrough'    暴力透传不暂停（不能刷 token 的账户全部 / 能刷 token 的非 token 失效类）
// canRefreshToken 由调用方按账户能力注入（oauth=true，apikey=false），不在纯函数里硬编码类型
const resolveAutoProtectionAction = ({ reason, disableAutoProtection, canRefreshToken }) => {
  if (!disableAutoProtection) {
    return 'suspend'
  }
  if (!isUpstreamReason(reason)) {
    // 非上游错误（预算等）不归开关管，调用方不应走到这里；保守返回 suspend
    return 'suspend'
  }
  if (canRefreshToken && TOKEN_FAILURE_REASONS.has(reason)) {
    return 'short_cooldown'
  }
  return 'passthrough'
}

// 账户是否可被调度（判定点核心）。输入均为已解析好的布尔/时间戳，保持纯函数。
//   isActive            管理员"停用账户"（手动，开关永不覆盖；undefined 视为 active）
//   manualUnschedulable 管理员"停止调度"（手动，开关永不覆盖）
//   budgetExceeded      每日/总预算超限（开关永不覆盖；仅 API-Key 类传 true）
//   autoSuspendedUntil  自动暂停到期时间戳(ms)；null/非数字表示无自动暂停
//   disableAutoProtection 开关
//   now                 当前时间戳(ms)
const isSchedulable = ({
  isActive,
  manualUnschedulable,
  budgetExceeded,
  autoSuspendedUntil,
  disableAutoProtection,
  now
}) => {
  if (isActive === false) {
    return { schedulable: false, reason: 'manual_inactive' }
  }
  if (manualUnschedulable === true) {
    return { schedulable: false, reason: 'manual_unschedulable' }
  }
  if (budgetExceeded === true) {
    return { schedulable: false, reason: 'budget' }
  }
  // 开关开：忽略一切自动暂停（含历史残留 error），直接可调度
  if (disableAutoProtection === true) {
    return { schedulable: true, reason: null }
  }
  if (typeof autoSuspendedUntil === 'number' && now < autoSuspendedUntil) {
    return { schedulable: false, reason: 'auto_suspended' }
  }
  return { schedulable: true, reason: null }
}

// toggle-on 开关时某条挂起是否应被清除（只清自动，不碰手动/预算）
const shouldClearOnEnable = (suspension) => Boolean(suspension) && suspension.source === 'auto'

module.exports = {
  UPSTREAM_REASONS,
  TOKEN_FAILURE_REASONS,
  isUpstreamReason,
  resolveAutoProtectionAction,
  isSchedulable,
  shouldClearOnEnable
}

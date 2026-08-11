const {
  isUpstreamReason,
  resolveAutoProtectionAction,
  isSchedulable,
  shouldClearOnEnable
} = require('../src/utils/suspensionPolicy')

describe('suspensionPolicy 纯函数', () => {
  describe('isUpstreamReason', () => {
    it('上游错误类返回 true', () => {
      const reasons = [
        'rate_limit',
        'overload',
        'service_unavailable',
        'timeout',
        'auth_error',
        'server_error',
        'five_hour_limit',
        'opus_weekly_limit',
        'token_refresh_failed'
      ]
      for (const reason of reasons) {
        expect(isUpstreamReason(reason)).toBe(true)
      }
    })

    it('非上游类（预算/手动/未知）返回 false', () => {
      expect(isUpstreamReason('budget')).toBe(false)
      expect(isUpstreamReason('manual')).toBe(false)
      expect(isUpstreamReason('whatever')).toBe(false)
      expect(isUpstreamReason(undefined)).toBe(false)
    })
  })

  describe('resolveAutoProtectionAction', () => {
    it('开关关：一律正常暂停', () => {
      expect(
        resolveAutoProtectionAction({
          reason: 'rate_limit',
          disableAutoProtection: false,
          canRefreshToken: false
        })
      ).toBe('suspend')
      expect(
        resolveAutoProtectionAction({
          reason: 'auth_error',
          disableAutoProtection: false,
          canRefreshToken: true
        })
      ).toBe('suspend')
    })

    it('apikey 类（不能刷 token）：开关开 = 任何上游错误都暴力透传', () => {
      const reasons = [
        'rate_limit',
        'overload',
        'server_error',
        'auth_error',
        'token_refresh_failed'
      ]
      for (const reason of reasons) {
        expect(
          resolveAutoProtectionAction({
            reason,
            disableAutoProtection: true,
            canRefreshToken: false
          })
        ).toBe('passthrough')
      }
    })

    it('oauth 类（能刷 token）：开关开 + token 失效 = 短冷却自愈', () => {
      expect(
        resolveAutoProtectionAction({
          reason: 'auth_error',
          disableAutoProtection: true,
          canRefreshToken: true
        })
      ).toBe('short_cooldown')
      expect(
        resolveAutoProtectionAction({
          reason: 'token_refresh_failed',
          disableAutoProtection: true,
          canRefreshToken: true
        })
      ).toBe('short_cooldown')
    })

    it('oauth 类：开关开 + 限流/过载等非 token 失效 = 透传', () => {
      const reasons = ['rate_limit', 'overload', 'server_error', 'five_hour_limit']
      for (const reason of reasons) {
        expect(
          resolveAutoProtectionAction({
            reason,
            disableAutoProtection: true,
            canRefreshToken: true
          })
        ).toBe('passthrough')
      }
    })

    it('非上游 reason（如预算）：保守暂停', () => {
      expect(
        resolveAutoProtectionAction({
          reason: 'budget',
          disableAutoProtection: true,
          canRefreshToken: false
        })
      ).toBe('suspend')
    })
  })

  describe('isSchedulable', () => {
    const base = {
      isActive: true,
      manualUnschedulable: false,
      budgetExceeded: false,
      autoSuspendedUntil: null,
      disableAutoProtection: false,
      now: 1000
    }

    it('干净账户可调度', () => {
      expect(isSchedulable(base).schedulable).toBe(true)
    })

    it('底线1：手动停用账户(isActive=false)不可调度——即使开关开', () => {
      expect(
        isSchedulable({ ...base, isActive: false, disableAutoProtection: true }).schedulable
      ).toBe(false)
    })

    it('底线1：手动停止调度(manualUnschedulable)不可调度——即使开关开', () => {
      expect(
        isSchedulable({ ...base, manualUnschedulable: true, disableAutoProtection: true })
          .schedulable
      ).toBe(false)
    })

    it('底线2/方案甲：预算超限不可调度——即使开关开', () => {
      expect(
        isSchedulable({ ...base, budgetExceeded: true, disableAutoProtection: true }).schedulable
      ).toBe(false)
    })

    it('开关关 + 自动暂停未到期 → 不可调度', () => {
      expect(isSchedulable({ ...base, autoSuspendedUntil: 5000, now: 1000 }).schedulable).toBe(
        false
      )
    })

    it('开关关 + 自动暂停已过期 → 可调度', () => {
      expect(isSchedulable({ ...base, autoSuspendedUntil: 500, now: 1000 }).schedulable).toBe(true)
    })

    it('review#1：开关开 → 忽略自动暂停（含历史残留），可调度', () => {
      expect(
        isSchedulable({
          ...base,
          autoSuspendedUntil: 999999999,
          disableAutoProtection: true,
          now: 1000
        }).schedulable
      ).toBe(true)
    })
  })

  describe('shouldClearOnEnable', () => {
    it('source=auto 应清除', () => {
      expect(shouldClearOnEnable({ source: 'auto' })).toBe(true)
    })

    it('source=manual 不清除', () => {
      expect(shouldClearOnEnable({ source: 'manual' })).toBe(false)
    })

    it('无 source/空 不清除', () => {
      expect(shouldClearOnEnable(null)).toBe(false)
      expect(shouldClearOnEnable({})).toBe(false)
    })
  })
})

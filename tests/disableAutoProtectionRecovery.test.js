/**
 * disableAutoProtection "开关即清理" 恢复逻辑测试
 *
 * 验证 buildAutoProtectionRecoveryPatch 的核心契约：
 * - 自动停用（限流/配额/过载/5h/401/403/Opus 周限/带 autoStoppedAt 标记的硬停）→ 生成恢复补丁
 * - 不恢复：isActive=false、无任何自动信号的 schedulable=false、以及裸 status='error'（无标记）
 *   说明：通用 status='error' 来源过宽（token 刷新/余额/外部直写），不可靠区分来源，故不作恢复依据；
 *   自动写 error 的路径改为在写入点用 disableAutoProtection 守卫，防止开关开启后再被写成 error
 */

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn()
}))

const {
  hasAutoStopEvidence,
  hasModelFamilyRateLimit,
  buildAutoProtectionRecoveryPatch
} = require('../src/utils/upstreamErrorHelper')

describe('disableAutoProtection 恢复逻辑', () => {
  describe('不应恢复的情况（手动停用 / 非自动）', () => {
    it('干净的 active 账户返回 null', () => {
      expect(buildAutoProtectionRecoveryPatch({ status: 'active', schedulable: 'true' })).toBeNull()
    })

    it('管理员手动停调度（schedulable=false，无任何自动痕迹）不恢复', () => {
      const account = { status: 'active', schedulable: 'false' }
      expect(hasAutoStopEvidence(account)).toBe(false)
      expect(buildAutoProtectionRecoveryPatch(account)).toBeNull()
    })

    it('管理员手动停用账户（isActive=false）不恢复', () => {
      expect(
        buildAutoProtectionRecoveryPatch({ isActive: 'false', schedulable: 'true' })
      ).toBeNull()
    })

    it('干净的手动停调度（status=active + schedulable=false，无自动信号）不恢复', () => {
      expect(
        buildAutoProtectionRecoveryPatch({ status: 'active', schedulable: 'false', priority: '50' })
      ).toBeNull()
    })

    it('裸 status=error（无 autoStoppedAt 标记，来源不可靠）不恢复', () => {
      // 通用 error 来源过宽（token 刷新/余额/外部直写），无标记时一律保守不恢复
      const account = { status: 'error', schedulable: 'false', errorMessage: 'unknown' }
      expect(hasAutoStopEvidence(account)).toBe(false)
      expect(buildAutoProtectionRecoveryPatch(account)).toBeNull()
    })
  })

  describe('应恢复的情况（自动停用）', () => {
    const expectRecovered = (patch) => {
      expect(patch).not.toBeNull()
      expect(patch.schedulable).toBe('true')
      expect(patch.status).toBe('active')
    }

    it('限流自动标记 rateLimitAutoStopped 触发恢复并清标记', () => {
      const patch = buildAutoProtectionRecoveryPatch({
        status: 'active',
        schedulable: 'false',
        rateLimitStatus: 'limited',
        rateLimitAutoStopped: 'true'
      })
      expectRecovered(patch)
      expect(patch.rateLimitAutoStopped).toBe('')
      expect(patch.rateLimitStatus).toBe('')
    })

    it('ccr status=rate_limited 触发恢复', () => {
      expectRecovered(
        buildAutoProtectionRecoveryPatch({ status: 'rate_limited', schedulable: 'true' })
      )
    })

    it('openai-responses status=quotaExceeded 触发恢复', () => {
      expectRecovered(
        buildAutoProtectionRecoveryPatch({ status: 'quotaExceeded', quotaStoppedAt: '2026-01-01' })
      )
    })

    it('claude-console 过载 overloadStatus=overloaded 触发恢复并清过载字段', () => {
      const patch = buildAutoProtectionRecoveryPatch({
        status: 'active',
        overloadStatus: 'overloaded',
        overloadedAt: '2026-01-01T00:00:00.000Z'
      })
      expectRecovered(patch)
      expect(patch.overloadStatus).toBe('')
      expect(patch.overloadedAt).toBe('')
    })

    it('配额停用触发恢复但不清配额字段（方案甲：预算独立，开关不清预算）', () => {
      const patch = buildAutoProtectionRecoveryPatch({
        schedulable: 'false',
        quotaStoppedAt: '2026-01-01',
        quotaAutoStopped: 'true'
      })
      expectRecovered(patch)
      expect(patch.quotaStoppedAt).toBeUndefined()
      expect(patch.quotaAutoStopped).toBeUndefined()
    })

    it('5 小时自停 fiveHourAutoStopped 触发恢复', () => {
      expectRecovered(
        buildAutoProtectionRecoveryPatch({ schedulable: 'false', fiveHourAutoStopped: 'true' })
      )
    })

    it('droid 自动硬停（status=error + autoStoppedAt 标记）触发恢复', () => {
      const account = { status: 'error', schedulable: 'false', autoStoppedAt: '2026-01-01' }
      expect(hasAutoStopEvidence(account)).toBe(true)
      expectRecovered(buildAutoProtectionRecoveryPatch(account))
    })

    it('401 未授权 status=unauthorized 触发恢复', () => {
      expectRecovered(
        buildAutoProtectionRecoveryPatch({ status: 'unauthorized', schedulable: 'false' })
      )
    })

    it.each(['opus', 'sonnet', 'haiku', 'fable'])(
      '%s 家族周限：清对应字段，但不算整账号停用、不动 schedulable/status',
      (family) => {
        const account = {
          status: 'active',
          schedulable: 'true',
          [`${family}RateLimitedAt`]: '2026-01-01T00:00:00.000Z',
          [`${family}RateLimitEndAt`]: '2026-01-08T00:00:00.000Z'
        }
        // 模型家族限流不停用整个账号，不能算作"整账号自动停用"证据
        expect(hasAutoStopEvidence(account)).toBe(false)
        expect(hasModelFamilyRateLimit(account)).toBe(true)
        const patch = buildAutoProtectionRecoveryPatch(account)
        expect(patch).not.toBeNull()
        // 家族字段被清空
        expect(patch[`${family}RateLimitedAt`]).toBe('')
        expect(patch[`${family}RateLimitEndAt`]).toBe('')
        // 但不恢复调度/状态（无整账号停用证据）
        expect(patch.schedulable).toBeUndefined()
        expect(patch.status).toBeUndefined()
      }
    )

    it('整账号自动停用 + 模型家族限流：既恢复调度又清家族字段', () => {
      const account = {
        status: 'active',
        schedulable: 'false',
        rateLimitAutoStopped: 'true',
        sonnetRateLimitEndAt: '2026-01-08T00:00:00.000Z'
      }
      expect(hasAutoStopEvidence(account)).toBe(true)
      const patch = buildAutoProtectionRecoveryPatch(account)
      expectRecovered(patch)
      expect(patch.rateLimitAutoStopped).toBe('')
      expect(patch.sonnetRateLimitEndAt).toBe('')
    })
  })

  describe('模型家族限流不得误恢复手动暂停（硬门契约）', () => {
    it.each(['opus', 'sonnet', 'haiku', 'fable'])(
      '管理员手动 schedulable=false + %s 家族限流：清家族字段但绝不恢复 schedulable',
      (family) => {
        const account = {
          status: 'active',
          schedulable: 'false', // 管理员手动暂停
          [`${family}RateLimitEndAt`]: '2026-01-08T00:00:00.000Z'
        }
        // 无整账号自动停用证据（家族限流不算），故不得恢复
        expect(hasAutoStopEvidence(account)).toBe(false)
        const patch = buildAutoProtectionRecoveryPatch(account)
        expect(patch).not.toBeNull()
        // 家族字段清空
        expect(patch[`${family}RateLimitEndAt`]).toBe('')
        // 关键：不得写回 schedulable='true'，否则误解除手动暂停
        expect(patch.schedulable).toBeUndefined()
        expect(patch.status).toBeUndefined()
      }
    )
  })
})

/**
 * stripReadonlyAccountFields 只读状态字段白名单测试
 *
 * 契约：账户"状态类"字段只能由系统内部（调度/限流/自动保护）写入，
 * 外部更新入口经 stripReadonlyAccountFields 后必须被剥离，防止伪造/清除。
 * 重点覆盖各模型家族限流字段（opus/sonnet/haiku/fable）——此前只挡 opus。
 */

const { stripReadonlyAccountFields } = require('../src/utils/commonHelper')

describe('stripReadonlyAccountFields', () => {
  it('保留普通配置类字段', () => {
    const input = { name: 'acc', priority: '50', description: 'x', schedulable: 'true' }
    expect(stripReadonlyAccountFields(input)).toEqual(input)
  })

  it('剥离通用状态类字段', () => {
    const cleaned = stripReadonlyAccountFields({
      name: 'acc',
      status: 'error',
      rateLimitStatus: 'limited',
      rateLimitAutoStopped: 'true'
    })
    expect(cleaned).toEqual({ name: 'acc' })
  })

  it.each(['opus', 'sonnet', 'haiku', 'fable'])(
    '剥离 %s 家族限流字段（防外部伪造 reset 时间或清除真实限流）',
    (family) => {
      const cleaned = stripReadonlyAccountFields({
        name: 'acc',
        [`${family}RateLimitedAt`]: '2026-01-01T00:00:00.000Z',
        [`${family}RateLimitEndAt`]: '2026-01-08T00:00:00.000Z'
      })
      expect(cleaned).toEqual({ name: 'acc' })
      expect(cleaned[`${family}RateLimitedAt`]).toBeUndefined()
      expect(cleaned[`${family}RateLimitEndAt`]).toBeUndefined()
    }
  )
})

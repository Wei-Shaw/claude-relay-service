const { CLAUDE_MODELS } = require('../config/models')

describe('models config', () => {
  it('每个 Claude 模型项都是非空的 {value, label} 结构', () => {
    expect(Array.isArray(CLAUDE_MODELS)).toBe(true)
    expect(CLAUDE_MODELS.length).toBeGreaterThan(0)
    for (const model of CLAUDE_MODELS) {
      expect(typeof model.value).toBe('string')
      expect(model.value).not.toBe('')
      expect(typeof model.label).toBe('string')
      expect(model.label).not.toBe('')
    }
  })

  it('下拉以最新旗舰 Claude Opus 4.8 打头', () => {
    // 仅断言"领头旗舰"这个有意义的排序意图，不锁具体第几位——
    // 旧断言"Sonnet 4.6 排第二"在头部加入 Opus 4.8/4.6 后失效，属脆弱断言，已改稳健。
    expect(CLAUDE_MODELS[0]).toEqual({ value: 'claude-opus-4-8', label: 'Claude Opus 4.8' })
  })
})

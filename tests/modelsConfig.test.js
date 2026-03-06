const { CLAUDE_MODELS } = require('../config/models')

describe('models config', () => {
  it('places Claude Sonnet 4.6 as the second Claude model option', () => {
    expect(CLAUDE_MODELS[1]).toEqual({
      value: 'claude-sonnet-4-6',
      label: 'Claude Sonnet 4.6'
    })
  })
})

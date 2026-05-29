const { CLAUDE_MODELS, OPENAI_MODELS, getDefaultModelEndpointConfigs } = require('../config/models')

describe('models config', () => {
  it('places Claude Sonnet 4.6 as the second Claude model option', () => {
    expect(CLAUDE_MODELS[1]).toEqual({
      value: 'claude-sonnet-4-6',
      label: 'Claude Sonnet 4.6'
    })
  })

  it('includes configurable endpoint defaults for current model shortcuts', () => {
    const endpointConfigs = getDefaultModelEndpointConfigs()

    expect(CLAUDE_MODELS[0]).toEqual({
      value: 'claude-opus-4-8',
      label: 'Claude Opus 4.8'
    })
    expect(OPENAI_MODELS[0]).toEqual({
      value: 'gpt-5.5',
      label: 'GPT-5.5'
    })
    expect(endpointConfigs.claude.mappingPresets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'claude-opus-4-8', to: 'claude-opus-4-8' })
      ])
    )
  })
})

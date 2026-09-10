jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  success: jest.fn()
}))

const { CLAUDE_MODELS, OPENAI_MODELS } = require('../config/models')
const modelService = require('../src/services/modelService')

describe('models config', () => {
  it('places Claude Sonnet 4.6 as the second Claude model option', () => {
    expect(CLAUDE_MODELS[1]).toEqual({
      value: 'claude-sonnet-4-6',
      label: 'Claude Sonnet 4.6'
    })
  })

  it('lists GPT-5.6 reasoning aliases in model configuration and model service', () => {
    const expectedModels = [
      'gpt-5.6-sol',
      'gpt-5.6-sol-high',
      'gpt-5.6-sol-xhigh',
      'gpt-5.6-terra',
      'gpt-5.6-terra-high',
      'gpt-5.6-terra-xhigh',
      'gpt-5.6-luna',
      'gpt-5.6-luna-high',
      'gpt-5.6-luna-xhigh'
    ]
    const configuredModels = OPENAI_MODELS.map((model) => model.value)
    const serviceModels = modelService.getDefaultModels().openai.models

    expect(configuredModels).toEqual(expect.arrayContaining(expectedModels))
    expect(serviceModels).toEqual(expect.arrayContaining(expectedModels))
  })
})

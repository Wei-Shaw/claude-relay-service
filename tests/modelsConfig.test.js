jest.mock('../src/utils/logger', () => ({
  api: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
  database: jest.fn(),
  security: jest.fn()
}))

const { CLAUDE_MODELS, BEDROCK_MODELS } = require('../config/models')
const modelService = require('../src/services/modelService')

describe('models config', () => {
  it('includes Claude Opus 4.7 in the Claude model options', () => {
    expect(CLAUDE_MODELS).toContainEqual({
      value: 'claude-opus-4-7',
      label: 'Claude Opus 4.7'
    })
  })

  it('includes Claude Opus 4.7 in the Bedrock model options', () => {
    expect(BEDROCK_MODELS).toContainEqual({
      value: 'us.anthropic.claude-opus-4-7-v1',
      label: 'Claude Opus 4.7'
    })
  })

  it('exposes Claude Opus 4.7 from the supported model service', () => {
    expect(modelService.isModelSupported('claude-opus-4-7')).toBe(true)
  })
})

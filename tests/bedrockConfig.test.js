const modelsConfig = require('../config/models')
const {
  normalizeBedrockRegion,
  assertSupportedBedrockModel
} = require('../src/utils/bedrockConfig')

describe('Bedrock configuration', () => {
  test('normalizes surrounding whitespace and case in AWS regions', () => {
    expect(normalizeBedrockRegion('  US-West-2\r\n')).toBe('us-west-2')
  })

  test('rejects malformed AWS regions before endpoint resolution', () => {
    expect(() => normalizeBedrockRegion('us-west-2.invalid')).toThrow('Invalid AWS Region')
  })

  test('rejects an explicitly empty AWS region instead of applying a fallback', () => {
    expect(() => normalizeBedrockRegion('', 'us-east-1')).toThrow('AWS Region is required')
    expect(() => normalizeBedrockRegion('   ', 'us-east-1')).toThrow('AWS Region is required')
  })

  test('publishes current Bedrock models and the Haiku 4.5 test default', () => {
    const modelIds = modelsConfig.BEDROCK_MODELS.map((model) => model.value)

    expect(modelsConfig.BEDROCK_TEST_MODEL).toBe('us.anthropic.claude-haiku-4-5-20251001-v1:0')
    expect(modelsConfig.BEDROCK_MODELS[0].value).toBe(modelsConfig.BEDROCK_TEST_MODEL)
    expect(modelIds).toContain(modelsConfig.BEDROCK_TEST_MODEL)
    expect(modelIds).toContain('global.anthropic.claude-opus-5')
    expect(modelIds).toContain('global.anthropic.claude-sonnet-5')
    expect(modelIds).toContain('us.anthropic.claude-sonnet-4-6')
    expect(modelIds.some((model) => model.includes('claude-3-5-haiku-20241022'))).toBe(false)
    expect(modelsConfig.CLAUDE_MODELS.map((model) => model.value)).not.toContain('claude-opus-5')
    expect(modelsConfig.CLAUDE_MODELS.map((model) => model.value)).not.toContain('claude-sonnet-5')
    expect(modelsConfig.getModelsByService('bedrock')).toBe(modelsConfig.BEDROCK_MODELS)
  })

  test('rejects the retired Bedrock Claude 3.5 Haiku model', () => {
    expect(() =>
      assertSupportedBedrockModel('us.anthropic.claude-3-5-haiku-20241022-v1:0')
    ).toThrow(/retired/)
    expect(() => assertSupportedBedrockModel('claude-3-5-haiku')).toThrow(/retired/)
  })
})

const mockClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn()
}

jest.mock('../src/models/redis', () => ({
  getClient: jest.fn(() => mockClient)
}))

jest.mock('../src/utils/logger', () => ({
  warn: jest.fn()
}))

const logger = require('../src/utils/logger')
const service = require('../src/services/connectivityTestModelConfigService')

const buildConfig = () => ({
  families: {
    claude: {
      defaultModel: 'claude-test',
      models: [{ value: 'claude-test', label: 'Claude Test' }]
    },
    gemini: {
      defaultModel: 'gemini-test',
      models: [{ value: 'gemini-test', label: 'Gemini Test' }]
    },
    openai: {
      defaultModel: 'gpt-test',
      models: [{ value: 'gpt-test', label: 'GPT Test' }]
    },
    bedrock: {
      defaultModel: 'bedrock-test',
      models: [{ value: 'bedrock-test', label: 'Bedrock Test' }]
    }
  }
})

describe('connectivityTestModelConfigService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockClient.get.mockResolvedValue(null)
    mockClient.set.mockResolvedValue('OK')
    mockClient.del.mockResolvedValue(1)
  })

  test('returns built-in defaults when no custom config exists', async () => {
    const config = await service.getConfig()

    expect(config.source).toBe('default')
    expect(config.families.claude.models.length).toBeGreaterThan(0)
    expect(config.families.claude.defaultModel).toBe(config.families.claude.models[0].value)
  })

  test('saves a normalized custom config', async () => {
    const input = buildConfig()
    input.families.claude.models[0] = {
      value: '  claude-custom  ',
      label: '  Claude Custom  '
    }
    input.families.claude.defaultModel = '  claude-custom  '

    const config = await service.saveConfig(input, 'operator')

    expect(config.source).toBe('custom')
    expect(config.updatedBy).toBe('operator')
    expect(config.families.claude).toEqual({
      defaultModel: 'claude-custom',
      models: [{ value: 'claude-custom', label: 'Claude Custom' }]
    })
    expect(mockClient.set).toHaveBeenCalledWith(
      'system:connectivity_test_models:v1',
      expect.any(String)
    )
  })

  test('rejects duplicate model ids without writing', async () => {
    const input = buildConfig()
    input.families.claude.models.push({ value: 'claude-test', label: 'Duplicate' })

    await expect(service.saveConfig(input)).rejects.toThrow(
      'claude contains duplicate model: claude-test'
    )
    expect(mockClient.set).not.toHaveBeenCalled()
  })

  test('rejects a default model outside its family list', async () => {
    const input = buildConfig()
    input.families.openai.defaultModel = 'missing-model'

    await expect(service.saveConfig(input)).rejects.toThrow(
      'openai.defaultModel must reference a model in the list'
    )
  })

  test('normalizes request models and rejects control characters', () => {
    expect(service.normalizeTestModel('  claude-custom  ')).toBe('claude-custom')
    expect(service.normalizeTestModel('claude\ncustom')).toBeNull()
    expect(service.normalizeTestModel('')).toBeNull()
  })

  test('falls back to defaults when stored data is invalid', async () => {
    mockClient.get.mockResolvedValue('{invalid json')

    const config = await service.getConfig()

    expect(config.source).toBe('default')
    expect(logger.warn).toHaveBeenCalled()
  })

  test('derives service and platform views from the saved families', async () => {
    mockClient.get.mockResolvedValue(
      JSON.stringify({
        version: 1,
        ...buildConfig(),
        updatedAt: '2026-07-12T00:00:00.000Z',
        updatedBy: 'operator'
      })
    )

    const config = await service.getPublicConfig()

    expect(config.services.claude).toEqual([{ value: 'claude-test', label: 'Claude Test' }])
    expect(config.platforms['claude-console']).toEqual(config.services.claude)
    expect(config.platforms.bedrock).toEqual([{ value: 'bedrock-test', label: 'Bedrock Test' }])
    expect(config.platforms['azure-openai']).toEqual([])
    expect(config.defaults.platforms['openai-responses']).toBe('gpt-test')
  })

  test('resets custom config by deleting the redis key', async () => {
    const config = await service.resetConfig()

    expect(mockClient.del).toHaveBeenCalledWith('system:connectivity_test_models:v1')
    expect(config.source).toBe('default')
  })
})

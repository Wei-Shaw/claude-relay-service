const redis = require('../models/redis')
const logger = require('../utils/logger')
const modelsConfig = require('../../config/models')

const REDIS_KEY = 'system:connectivity_test_models:v1'
const CONFIG_VERSION = 1
const FAMILY_KEYS = ['claude', 'gemini', 'openai', 'bedrock']
const MAX_MODELS_PER_FAMILY = 100

const DEFAULT_MODEL_LISTS = {
  claude: modelsConfig.CLAUDE_MODELS,
  gemini: modelsConfig.GEMINI_MODELS,
  openai: modelsConfig.OPENAI_MODELS,
  bedrock: modelsConfig.BEDROCK_MODELS
}

const SERVICE_FAMILIES = {
  claude: 'claude',
  gemini: 'gemini',
  openai: 'openai'
}

const PLATFORM_FAMILIES = {
  claude: 'claude',
  'claude-console': 'claude',
  bedrock: 'bedrock',
  gemini: 'gemini',
  'gemini-api': 'gemini',
  'openai-responses': 'openai',
  droid: 'claude',
  ccr: 'claude'
}

class ConnectivityTestModelConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConnectivityTestModelConfigError'
    this.statusCode = 400
  }
}

function cloneModels(models) {
  return models.map((model) => ({ value: model.value, label: model.label }))
}

function hasControlCharacters(value) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

function normalizeTestModel(value) {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  if (!normalized || normalized.length > 256 || hasControlCharacters(normalized)) {
    return null
  }
  return normalized
}

function getDefaultConfig() {
  const families = {}

  for (const family of FAMILY_KEYS) {
    const models = cloneModels(DEFAULT_MODEL_LISTS[family])
    families[family] = {
      defaultModel: models[0]?.value || '',
      models
    }
  }

  return { version: CONFIG_VERSION, families }
}

function normalizeText(value, fieldName, maxLength) {
  if (typeof value !== 'string') {
    throw new ConnectivityTestModelConfigError(`${fieldName} must be a string`)
  }

  const normalized = value.trim()
  if (!normalized) {
    throw new ConnectivityTestModelConfigError(`${fieldName} is required`)
  }
  if (normalized.length > maxLength) {
    throw new ConnectivityTestModelConfigError(
      `${fieldName} must be no more than ${maxLength} characters`
    )
  }
  if (hasControlCharacters(normalized)) {
    throw new ConnectivityTestModelConfigError(`${fieldName} contains invalid control characters`)
  }

  return normalized
}

function normalizeFamilies(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ConnectivityTestModelConfigError('families must be an object')
  }

  const families = {}

  for (const family of FAMILY_KEYS) {
    const familyConfig = input[family]
    if (!familyConfig || typeof familyConfig !== 'object' || Array.isArray(familyConfig)) {
      throw new ConnectivityTestModelConfigError(`${family} configuration is required`)
    }
    if (!Array.isArray(familyConfig.models) || familyConfig.models.length === 0) {
      throw new ConnectivityTestModelConfigError(`${family} must contain at least one model`)
    }
    if (familyConfig.models.length > MAX_MODELS_PER_FAMILY) {
      throw new ConnectivityTestModelConfigError(
        `${family} cannot contain more than ${MAX_MODELS_PER_FAMILY} models`
      )
    }

    const seen = new Set()
    const models = familyConfig.models.map((model, index) => {
      if (!model || typeof model !== 'object' || Array.isArray(model)) {
        throw new ConnectivityTestModelConfigError(`${family}.models[${index}] must be an object`)
      }

      const value = normalizeText(model.value, `${family}.models[${index}].value`, 256)
      const label = normalizeText(model.label, `${family}.models[${index}].label`, 120)
      if (seen.has(value)) {
        throw new ConnectivityTestModelConfigError(`${family} contains duplicate model: ${value}`)
      }
      seen.add(value)

      return { value, label }
    })

    const defaultModel = normalizeText(familyConfig.defaultModel, `${family}.defaultModel`, 256)
    if (!seen.has(defaultModel)) {
      throw new ConnectivityTestModelConfigError(
        `${family}.defaultModel must reference a model in the list`
      )
    }

    families[family] = { defaultModel, models }
  }

  return families
}

function normalizeStoredConfig(input) {
  return {
    version: CONFIG_VERSION,
    families: normalizeFamilies(input?.families),
    updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt : null,
    updatedBy: typeof input?.updatedBy === 'string' ? input.updatedBy : null
  }
}

async function getConfig() {
  const stored = await redis.getClient().get(REDIS_KEY)
  if (!stored) {
    return { ...getDefaultConfig(), source: 'default', updatedAt: null, updatedBy: null }
  }

  try {
    return { ...normalizeStoredConfig(JSON.parse(stored)), source: 'custom' }
  } catch (error) {
    logger.warn(`⚠️ Invalid connectivity test model config, using defaults: ${error.message}`)
    return { ...getDefaultConfig(), source: 'default', updatedAt: null, updatedBy: null }
  }
}

function buildPublicConfig(config) {
  const services = {}
  const platforms = { 'azure-openai': [] }
  const defaults = { services: {}, platforms: {} }

  for (const [service, family] of Object.entries(SERVICE_FAMILIES)) {
    services[service] = cloneModels(config.families[family].models)
    defaults.services[service] = config.families[family].defaultModel
  }

  for (const [platform, family] of Object.entries(PLATFORM_FAMILIES)) {
    platforms[platform] = cloneModels(config.families[family].models)
    defaults.platforms[platform] = config.families[family].defaultModel
  }

  return {
    services,
    platforms,
    defaults,
    source: config.source,
    updatedAt: config.updatedAt
  }
}

async function getPublicConfig() {
  return buildPublicConfig(await getConfig())
}

async function getDefaultModelForPlatform(platform) {
  const family = PLATFORM_FAMILIES[platform]
  if (!family) {
    return null
  }
  const config = await getConfig()
  return config.families[family].defaultModel
}

async function saveConfig(input, updatedBy = 'admin') {
  const config = {
    version: CONFIG_VERSION,
    families: normalizeFamilies(input?.families),
    updatedAt: new Date().toISOString(),
    updatedBy
  }

  await redis.getClient().set(REDIS_KEY, JSON.stringify(config))
  return { ...config, source: 'custom' }
}

async function resetConfig() {
  await redis.getClient().del(REDIS_KEY)
  return { ...getDefaultConfig(), source: 'default', updatedAt: null, updatedBy: null }
}

module.exports = {
  normalizeTestModel,
  getConfig,
  getPublicConfig,
  getDefaultModelForPlatform,
  saveConfig,
  resetConfig
}

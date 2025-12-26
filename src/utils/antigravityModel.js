const DEFAULT_ANTIGRAVITY_MODEL = 'gemini-2.5-flash'

const UPSTREAM_TO_ALIAS = {
  'rev19-uic3-1p': 'gemini-2.5-computer-use-preview-10-2025',
  'gemini-3-pro-image': 'gemini-3-pro-image-preview',
  'gemini-3-pro-high': 'gemini-3-pro-preview',
  'gemini-3-flash': 'gemini-3-flash-preview',
  'claude-sonnet-4-5': 'gemini-claude-sonnet-4-5',
  'claude-sonnet-4-5-thinking': 'gemini-claude-sonnet-4-5-thinking',
  'claude-opus-4-5-thinking': 'gemini-claude-opus-4-5-thinking',
  chat_20706: '',
  chat_23310: '',
  'gemini-2.5-flash-thinking': '',
  'gemini-3-pro-low': '',
  'gemini-2.5-pro': ''
}

const ALIAS_TO_UPSTREAM = {
  'gemini-2.5-computer-use-preview-10-2025': 'rev19-uic3-1p',
  'gemini-3-pro-image-preview': 'gemini-3-pro-image',
  'gemini-3-pro-preview': 'gemini-3-pro-high',
  'gemini-3-flash-preview': 'gemini-3-flash',
  'gemini-claude-sonnet-4-5': 'claude-sonnet-4-5',
  'gemini-claude-sonnet-4-5-thinking': 'claude-sonnet-4-5-thinking',
  'gemini-claude-opus-4-5-thinking': 'claude-opus-4-5-thinking'
}

const ANTIGRAVITY_MODEL_METADATA = {
  'gemini-2.5-flash': {
    thinking: { min: 0, max: 24576, zeroAllowed: true, dynamicAllowed: true },
    name: 'models/gemini-2.5-flash'
  },
  'gemini-2.5-flash-lite': {
    thinking: { min: 0, max: 24576, zeroAllowed: true, dynamicAllowed: true },
    name: 'models/gemini-2.5-flash-lite'
  },
  'gemini-2.5-computer-use-preview-10-2025': {
    name: 'models/gemini-2.5-computer-use-preview-10-2025'
  },
  'gemini-3-pro-preview': {
    thinking: {
      min: 128,
      max: 32768,
      zeroAllowed: false,
      dynamicAllowed: true,
      levels: ['low', 'high']
    },
    name: 'models/gemini-3-pro-preview'
  },
  'gemini-3-pro-image-preview': {
    thinking: {
      min: 128,
      max: 32768,
      zeroAllowed: false,
      dynamicAllowed: true,
      levels: ['low', 'high']
    },
    name: 'models/gemini-3-pro-image-preview'
  },
  'gemini-3-flash-preview': {
    thinking: {
      min: 128,
      max: 32768,
      zeroAllowed: false,
      dynamicAllowed: true,
      levels: ['minimal', 'low', 'medium', 'high']
    },
    name: 'models/gemini-3-flash-preview'
  },
  'gemini-claude-sonnet-4-5-thinking': {
    thinking: { min: 1024, max: 200000, zeroAllowed: false, dynamicAllowed: true },
    maxCompletionTokens: 64000
  },
  'gemini-claude-opus-4-5-thinking': {
    thinking: { min: 1024, max: 200000, zeroAllowed: false, dynamicAllowed: true },
    maxCompletionTokens: 64000
  }
}

function normalizeAntigravityModelInput(model, defaultModel = DEFAULT_ANTIGRAVITY_MODEL) {
  if (!model) {
    return defaultModel
  }
  return model.startsWith('models/') ? model.slice('models/'.length) : model
}

function getAntigravityModelAlias(modelName) {
  const normalized = normalizeAntigravityModelInput(modelName)
  if (Object.prototype.hasOwnProperty.call(UPSTREAM_TO_ALIAS, normalized)) {
    return UPSTREAM_TO_ALIAS[normalized]
  }
  return normalized
}

function getAntigravityModelMetadata(modelName) {
  const normalized = normalizeAntigravityModelInput(modelName)
  if (Object.prototype.hasOwnProperty.call(ANTIGRAVITY_MODEL_METADATA, normalized)) {
    return ANTIGRAVITY_MODEL_METADATA[normalized]
  }
  if (normalized.startsWith('claude-')) {
    const prefixed = `gemini-${normalized}`
    if (Object.prototype.hasOwnProperty.call(ANTIGRAVITY_MODEL_METADATA, prefixed)) {
      return ANTIGRAVITY_MODEL_METADATA[prefixed]
    }
    const thinkingAlias = `${prefixed}-thinking`
    if (Object.prototype.hasOwnProperty.call(ANTIGRAVITY_MODEL_METADATA, thinkingAlias)) {
      return ANTIGRAVITY_MODEL_METADATA[thinkingAlias]
    }
  }
  return null
}

function mapAntigravityUpstreamModel(model) {
  const normalized = normalizeAntigravityModelInput(model)
  let upstream = Object.prototype.hasOwnProperty.call(ALIAS_TO_UPSTREAM, normalized)
    ? ALIAS_TO_UPSTREAM[normalized]
    : normalized

  if (upstream.startsWith('gemini-claude-')) {
    upstream = upstream.replace(/^gemini-/, '')
  }

  const mapping = {
    // Opus：上游更常见的是 thinking 变体（CLIProxyAPI 也按此处理）
    'claude-opus-4-5': 'claude-opus-4-5-thinking',
    // Gemini thinking 变体回退
    'gemini-2.5-flash-thinking': 'gemini-2.5-flash'
  }

  return mapping[upstream] || upstream
}

module.exports = {
  normalizeAntigravityModelInput,
  getAntigravityModelAlias,
  getAntigravityModelMetadata,
  mapAntigravityUpstreamModel
}

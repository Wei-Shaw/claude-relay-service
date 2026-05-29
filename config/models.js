/**
 * 模型列表配置
 * 用于前端展示和测试功能
 */

const CLAUDE_MODELS = [
  { value: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 Alias' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' }
]

const GEMINI_MODELS = [
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' }
]

const OPENAI_MODELS = [
  { value: 'gpt-5.5', label: 'GPT-5.5' },
  { value: 'gpt-5.5-pro', label: 'GPT-5.5 Pro' },
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.4-pro', label: 'GPT-5.4 Pro' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
  { value: 'gpt-5', label: 'GPT-5' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
  { value: 'gpt-5.1', label: 'GPT-5.1' },
  { value: 'gpt-5.1-codex', label: 'GPT-5.1 Codex' },
  { value: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
  { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' },
  { value: 'gpt-5.2', label: 'GPT-5.2' },
  { value: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
  { value: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
  { value: 'gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark' },
  { value: 'codex-mini', label: 'Codex Mini' }
]

const BEDROCK_MODELS = [
  { value: 'anthropic.claude-opus-4-8', label: 'Claude Opus 4.8' },
  { value: 'anthropic.claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Claude Haiku 4.5' },
  { value: 'us.anthropic.claude-opus-4-6-20250610-v1:0', label: 'Claude Opus 4.6' },
  { value: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', label: 'Claude Sonnet 4.5' },
  { value: 'us.anthropic.claude-sonnet-4-20250514-v1:0', label: 'Claude Sonnet 4' },
  { value: 'us.anthropic.claude-3-5-haiku-20241022-v1:0', label: 'Claude 3.5 Haiku' }
]

// 其他模型（用于账户编辑的模型映射）
const OTHER_MODELS = [
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'glm-5.1', label: 'GLM 5.1' },
  { value: 'Qwen', label: 'Qwen' },
  { value: 'Kimi', label: 'Kimi' },
  { value: 'GLM', label: 'GLM' }
]

const mergeModelOptions = (...groups) => {
  const seen = new Set()
  const merged = []

  groups.flat().forEach((model) => {
    if (!model?.value || seen.has(model.value)) return
    seen.add(model.value)
    merged.push({ value: model.value, label: model.label || model.value })
  })

  return merged
}

const cloneModelOptions = (models) =>
  models.map((model) => ({ value: model.value, label: model.label || model.value }))

const cloneMappingPresets = (presets) =>
  presets.map((preset) => ({
    label: preset.label || `+ ${preset.from}`,
    from: preset.from,
    to: preset.to
  }))

const CLAUDE_MAPPING_PRESETS = [
  { label: '+ Opus 4.8', from: 'claude-opus-4-8', to: 'claude-opus-4-8' },
  { label: '+ Sonnet 4.6', from: 'claude-sonnet-4-6', to: 'claude-sonnet-4-6' },
  { label: '+ Haiku 4.5', from: 'claude-haiku-4-5', to: 'claude-haiku-4-5-20251001' },
  { label: '+ Opus 4.6', from: 'claude-opus-4-6', to: 'claude-opus-4-6' },
  { label: '+ Sonnet 4.5', from: 'claude-sonnet-4-5-20250929', to: 'claude-sonnet-4-5-20250929' },
  { label: '+ Haiku 3.5', from: 'claude-3-5-haiku-20241022', to: 'claude-3-5-haiku-20241022' },
  { label: '+ sonnet', from: 'sonnet', to: 'claude-sonnet-4-6' },
  { label: '+ opus', from: 'opus', to: 'claude-opus-4-8' },
  { label: '+ haiku', from: 'haiku', to: 'claude-haiku-4-5-20251001' },
  { label: '+ GLM 5.1', from: 'glm-5.1', to: 'glm-5.1' },
  { label: '+ DeepSeek', from: 'deepseek-chat', to: 'deepseek-chat' },
  { label: '+ Qwen', from: 'Qwen', to: 'Qwen' },
  { label: '+ Kimi', from: 'Kimi', to: 'Kimi' },
  { label: '+ GLM', from: 'GLM', to: 'GLM' },
  { label: '+ Opus → Sonnet', from: 'claude-opus-4-1-20250805', to: 'claude-sonnet-4-6' }
]

const OPENAI_MAPPING_PRESETS = [
  { label: '+ GPT-5.5', from: 'gpt-5.5', to: 'gpt-5.5' },
  { label: '+ GPT-5.5 Pro', from: 'gpt-5.5-pro', to: 'gpt-5.5-pro' },
  { label: '+ GPT-5.4', from: 'gpt-5.4', to: 'gpt-5.4' },
  { label: '+ GPT-5.4 Mini', from: 'gpt-5.4-mini', to: 'gpt-5.4-mini' },
  { label: '+ GPT-5', from: 'gpt-5', to: 'gpt-5' },
  { label: '+ GPT-5 Mini', from: 'gpt-5-mini', to: 'gpt-5-mini' },
  { label: '+ Codex', from: 'codex', to: 'gpt-5.3-codex' }
]

const GEMINI_MAPPING_PRESETS = [
  { label: '+ Gemini 3.1 Pro', from: 'gemini-3.1-pro-preview', to: 'gemini-3.1-pro-preview' },
  { label: '+ Gemini 3 Pro', from: 'gemini-3-pro-preview', to: 'gemini-3-pro-preview' },
  { label: '+ Gemini 2.5 Pro', from: 'gemini-2.5-pro', to: 'gemini-2.5-pro' },
  { label: '+ Gemini 2.5 Flash', from: 'gemini-2.5-flash', to: 'gemini-2.5-flash' }
]

const BEDROCK_MAPPING_PRESETS = [
  {
    label: '+ Opus 4.8',
    from: 'claude-opus-4-8',
    to: 'anthropic.claude-opus-4-8'
  },
  {
    label: '+ Sonnet 4.6',
    from: 'claude-sonnet-4-6',
    to: 'anthropic.claude-sonnet-4-6'
  },
  {
    label: '+ Haiku 4.5',
    from: 'claude-haiku-4-5',
    to: 'anthropic.claude-haiku-4-5-20251001-v1:0'
  }
]

const MODEL_ENDPOINT_CONFIGS = {
  claude: {
    label: 'Claude',
    whitelistModels: mergeModelOptions(CLAUDE_MODELS, OTHER_MODELS),
    mappingPresets: CLAUDE_MAPPING_PRESETS
  },
  openai: {
    label: 'OpenAI Chat',
    whitelistModels: cloneModelOptions(OPENAI_MODELS),
    mappingPresets: OPENAI_MAPPING_PRESETS
  },
  'openai-responses': {
    label: 'OpenAI Responses',
    whitelistModels: cloneModelOptions(OPENAI_MODELS),
    mappingPresets: OPENAI_MAPPING_PRESETS
  },
  'azure-openai': {
    label: 'Azure OpenAI',
    whitelistModels: cloneModelOptions(OPENAI_MODELS),
    mappingPresets: OPENAI_MAPPING_PRESETS
  },
  gemini: {
    label: 'Gemini',
    whitelistModels: cloneModelOptions(GEMINI_MODELS),
    mappingPresets: GEMINI_MAPPING_PRESETS
  },
  bedrock: {
    label: 'Bedrock',
    whitelistModels: cloneModelOptions(BEDROCK_MODELS),
    mappingPresets: BEDROCK_MAPPING_PRESETS
  },
  droid: {
    label: 'Droid',
    whitelistModels: mergeModelOptions(CLAUDE_MODELS, OTHER_MODELS),
    mappingPresets: CLAUDE_MAPPING_PRESETS
  },
  ccr: {
    label: 'CCR',
    whitelistModels: mergeModelOptions(CLAUDE_MODELS, OTHER_MODELS),
    mappingPresets: CLAUDE_MAPPING_PRESETS
  }
}

const getDefaultModelEndpointConfigs = () =>
  Object.fromEntries(
    Object.entries(MODEL_ENDPOINT_CONFIGS).map(([endpoint, config]) => [
      endpoint,
      {
        label: config.label,
        whitelistModels: cloneModelOptions(config.whitelistModels),
        mappingPresets: cloneMappingPresets(config.mappingPresets)
      }
    ])
  )

// 各平台测试可用模型
const PLATFORM_TEST_MODELS = {
  claude: CLAUDE_MODELS,
  'claude-console': CLAUDE_MODELS,
  bedrock: BEDROCK_MODELS,
  gemini: GEMINI_MODELS,
  'gemini-api': GEMINI_MODELS,
  'openai-responses': OPENAI_MODELS,
  'azure-openai': [],
  droid: CLAUDE_MODELS,
  ccr: CLAUDE_MODELS
}

module.exports = {
  CLAUDE_MODELS,
  GEMINI_MODELS,
  OPENAI_MODELS,
  BEDROCK_MODELS,
  OTHER_MODELS,
  PLATFORM_TEST_MODELS,
  MODEL_ENDPOINT_CONFIGS,
  getDefaultModelEndpointConfigs,
  // 按服务分组
  getModelsByService: (service) => {
    switch (service) {
      case 'claude':
        return CLAUDE_MODELS
      case 'gemini':
        return GEMINI_MODELS
      case 'openai':
        return OPENAI_MODELS
      default:
        return []
    }
  },
  // 获取所有模型（用于账户编辑）
  getAllModels: () => mergeModelOptions(CLAUDE_MODELS, GEMINI_MODELS, OPENAI_MODELS, OTHER_MODELS)
}

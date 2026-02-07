/**
 * 模型列表配置
 * 用于前端展示和测试功能
 */

const CLAUDE_MODELS = [
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' }
]

const GEMINI_MODELS = [
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' }
]

const OPENAI_MODELS = [
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
  { value: 'codex-mini', label: 'Codex Mini' }
]

// 其他模型（用于账户编辑的模型映射）
const OTHER_MODELS = [
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'Qwen', label: 'Qwen' },
  { value: 'Kimi', label: 'Kimi' },
  { value: 'GLM', label: 'GLM' }
]

module.exports = {
  CLAUDE_MODELS,
  GEMINI_MODELS,
  OPENAI_MODELS,
  OTHER_MODELS,
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
  getAllModels: () => [...CLAUDE_MODELS, ...GEMINI_MODELS, ...OPENAI_MODELS, ...OTHER_MODELS]
}

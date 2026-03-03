function detectBackendFromModel(modelName) {
  if (!modelName) {
    return 'claude'
  }

  const model = String(modelName).toLowerCase()

  if (model.startsWith('claude-')) {
    return 'claude'
  }

  if (model.startsWith('gemini-')) {
    return 'gemini'
  }

  if (
    model.startsWith('gpt-') ||
    model.startsWith('o1') ||
    model.startsWith('o3') ||
    model.startsWith('o4') ||
    model.startsWith('codex') ||
    model.startsWith('deepseek') ||
    model.startsWith('qwen') ||
    model.startsWith('kimi') ||
    model.startsWith('glm')
  ) {
    return 'openai'
  }

  if (
    model.includes('/deepseek') ||
    model.includes('/qwen') ||
    model.includes('/kimi') ||
    model.includes('/glm') ||
    model.includes('/gpt')
  ) {
    return 'openai'
  }

  return 'claude'
}

module.exports = {
  detectBackendFromModel
}

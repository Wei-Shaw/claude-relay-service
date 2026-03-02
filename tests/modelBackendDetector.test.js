const { detectBackendFromModel } = require('../src/utils/modelBackendDetector')

describe('modelBackendDetector', () => {
  it('routes codex models to openai backend', () => {
    expect(detectBackendFromModel('codex-mini')).toBe('openai')
  })

  it('routes DeepSeek models to openai backend', () => {
    expect(detectBackendFromModel('deepseek-chat')).toBe('openai')
    expect(detectBackendFromModel('deepseek/deepseek-v3')).toBe('openai')
  })

  it('routes Qwen models to openai backend', () => {
    expect(detectBackendFromModel('qwen-plus')).toBe('openai')
    expect(detectBackendFromModel('qwen/qwen3-32b')).toBe('openai')
  })

  it('keeps existing claude and gemini routing behavior', () => {
    expect(detectBackendFromModel('claude-sonnet-4-5-20250929')).toBe('claude')
    expect(detectBackendFromModel('gemini-2.5-pro')).toBe('gemini')
  })
})

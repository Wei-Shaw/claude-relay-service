const { isModelRestricted, modelMatchesRestriction } = require('../src/utils/modelHelper')

describe('modelHelper model restrictions', () => {
  it('matches exact model restriction entries', () => {
    expect(modelMatchesRestriction('gpt-5.6', 'gpt-5.6')).toBe(true)
    expect(modelMatchesRestriction('gpt-5.6-codex', 'gpt-5.6')).toBe(false)
  })

  it('matches wildcard restriction entries', () => {
    expect(modelMatchesRestriction('gpt-5.6-codex', 'gpt-5.6*')).toBe(true)
    expect(modelMatchesRestriction('claude-opus-4-1-20250805', 'claude-opus-4-*')).toBe(true)
    expect(modelMatchesRestriction('claude-sonnet-4-20250514', 'claude-opus-4-*')).toBe(false)
  })

  it('treats dots and other regexp characters literally', () => {
    expect(modelMatchesRestriction('gpt-5x6-codex', 'gpt-5.6*')).toBe(false)
    expect(modelMatchesRestriction('gpt-5.6-codex', 'gpt-5.6*')).toBe(true)
  })

  it('checks a full restricted model list', () => {
    const restrictedModels = ['claude-opus-4-*', 'gpt-5.6*']

    expect(isModelRestricted('gpt-5.6-codex', restrictedModels)).toBe(true)
    expect(isModelRestricted('claude-sonnet-4-20250514', restrictedModels)).toBe(false)
  })
})

const {
  applyOpenAIStorePolicy,
  ensureOpenAISessionHeader,
  ensureResponsesPromptCacheKey,
  getOpenAIContinuity
} = require('../src/utils/openaiContinuity')

describe('openaiContinuity utils', () => {
  it('prefers prompt_cache_key after session/conversation fallbacks', () => {
    const result = getOpenAIContinuity({
      headers: {},
      body: { conversation_id: 'conv_1', prompt_cache_key: 'pck_1' }
    })

    expect(result.continuityKey).toBe('conv_1')
    expect(result.source).toBe('body.conversation_id')
    expect(result.sessionHash).toHaveLength(64)
  })

  it('uses prompt_cache_key when it is the only stable continuity key', () => {
    const result = getOpenAIContinuity({
      headers: {},
      body: { prompt_cache_key: 'pck_only' }
    })

    expect(result.continuityKey).toBe('pck_only')
    expect(result.source).toBe('body.prompt_cache_key')
  })

  it('adds canonical session_id header when only fallback continuity key exists', () => {
    const headers = ensureOpenAISessionHeader({ 'x-session-id': 'sid_alt' }, 'pck_only')
    expect(headers.session_id).toBe('pck_only')
    expect(headers['x-session-id']).toBe('sid_alt')
  })

  it('preserves explicit store=true for continuity-aware requests', () => {
    const body = { store: true, prompt_cache_key: 'pck_1' }
    applyOpenAIStorePolicy(body, { isCompactRoute: false, continuityKey: 'pck_1' })
    expect(body.store).toBe(true)
  })

  it('does not default store=false when continuity hints already exist', () => {
    const body = { prompt_cache_key: 'pck_1' }
    applyOpenAIStorePolicy(body, { isCompactRoute: false, continuityKey: 'pck_1' })
    expect(Object.prototype.hasOwnProperty.call(body, 'store')).toBe(false)
  })

  it('defaults store=false only for requests without continuity hints', () => {
    const body = {}
    applyOpenAIStorePolicy(body, { isCompactRoute: false, continuityKey: null })
    expect(body.store).toBe(false)
  })

  it('injects prompt_cache_key for responses payloads when missing', () => {
    const body = { input: [{ role: 'user', content: 'hi' }] }
    ensureResponsesPromptCacheKey(body, 'sid_123')
    expect(body.prompt_cache_key).toBe('sid_123')
  })
})

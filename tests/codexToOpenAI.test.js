const CodexToOpenAIConverter = require('../src/services/codexToOpenAI')

describe('CodexToOpenAIConverter', () => {
  it('preserves store and previous_response_id when building responses payload', () => {
    const converter = new CodexToOpenAIConverter()
    const body = converter.buildRequestFromOpenAI({
      model: 'gpt-5.4',
      stream: false,
      store: true,
      previous_response_id: 'resp_prev_123',
      session_id: 'sess_1',
      prompt_cache_key: 'pck_1',
      messages: [{ role: 'user', content: 'hi' }]
    })

    expect(body.store).toBe(true)
    expect(body.previous_response_id).toBe('resp_prev_123')
    expect(body.session_id).toBe('sess_1')
    expect(body.prompt_cache_key).toBe('pck_1')
  })

  it('omits store when caller did not specify it', () => {
    const converter = new CodexToOpenAIConverter()
    const body = converter.buildRequestFromOpenAI({
      model: 'gpt-5.4',
      stream: false,
      messages: [{ role: 'user', content: 'hi' }]
    })

    expect(Object.prototype.hasOwnProperty.call(body, 'store')).toBe(false)
  })
})

const StreamTextCollector = require('../src/utils/streamTextCollector')

describe('streamTextCollector', () => {
  test('parses Anthropic content_block_delta SSE chunks', () => {
    const collector = new StreamTextCollector({ format: 'anthropic' })
    collector.onChunk(
      'event: content_block_delta\n' +
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}\n\n'
    )
    collector.onChunk(
      'event: content_block_delta\n' +
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"world"}}\n\n'
    )
    collector.onChunk(
      'event: content_block_delta\n' +
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"!"}}\n\n'
    )

    expect(collector.getText()).toBe('Hello world!')
  })

  test('handles partial Anthropic chunks split across calls', () => {
    const collector = new StreamTextCollector({ format: 'anthropic' })
    const full =
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Streamed"}}\n\n'
    collector.onChunk(full.slice(0, 30))
    collector.onChunk(full.slice(30))
    expect(collector.getText()).toBe('Streamed')
  })

  test('captures Anthropic thinking_delta chunks', () => {
    const collector = new StreamTextCollector({ format: 'anthropic' })
    collector.onChunk(
      'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}\n\n'
    )
    expect(collector.getText()).toBe('hmm')
  })

  test('parses OpenAI choices.delta.content SSE chunks', () => {
    const collector = new StreamTextCollector({ format: 'openai' })
    collector.onChunk('data: {"choices":[{"delta":{"content":"foo"}}]}\n\n')
    collector.onChunk('data: {"choices":[{"delta":{"content":" bar"}}]}\n\n')
    collector.onChunk('data: [DONE]\n\n')
    expect(collector.getText()).toBe('foo bar')
  })

  test('parses OpenAI array content parts', () => {
    const collector = new StreamTextCollector({ format: 'openai' })
    collector.onChunk(
      'data: {"choices":[{"delta":{"content":[{"type":"text","text":"alpha"},{"type":"text","text":" beta"}]}}]}\n\n'
    )
    expect(collector.getText()).toBe('alpha beta')
  })

  test('parses Gemini SSE candidates parts text', () => {
    const collector = new StreamTextCollector({ format: 'gemini' })
    collector.onChunk(
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n' +
        'data: {"candidates":[{"content":{"parts":[{"text":" Gemini"}]}}]}\n\n'
    )
    expect(collector.getText()).toBe('Hello Gemini')
  })

  test('parses Gemini wrapped response shape', () => {
    const collector = new StreamTextCollector({ format: 'gemini' })
    collector.onChunk(
      'data: {"response":{"candidates":[{"content":{"parts":[{"text":"wrapped"}]}}]}}\n\n'
    )
    expect(collector.getText()).toBe('wrapped')
  })

  test('skips malformed JSON silently', () => {
    const collector = new StreamTextCollector({ format: 'anthropic' })
    collector.onChunk('data: {not json}\n\n')
    collector.onChunk(
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}\n\n'
    )
    expect(collector.getText()).toBe('ok')
  })

  test('caps accumulated text at maxChars', () => {
    const collector = new StreamTextCollector({ format: 'anthropic', maxChars: 16 })
    collector.onChunk(
      `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"${'A'.repeat(10)}"}}\n\n`
    )
    collector.onChunk(
      `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"${'B'.repeat(20)}"}}\n\n`
    )
    expect(collector.getText().length).toBe(16)
    expect(collector.isTruncated()).toBe(true)
  })

  test('accepts Buffer input', () => {
    const collector = new StreamTextCollector({ format: 'anthropic' })
    collector.onChunk(
      Buffer.from('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"buf"}}\n\n')
    )
    expect(collector.getText()).toBe('buf')
  })

  test('ignores null/undefined chunks', () => {
    const collector = new StreamTextCollector({ format: 'anthropic' })
    expect(() => {
      collector.onChunk(null)
      collector.onChunk(undefined)
    }).not.toThrow()
    expect(collector.getText()).toBe('')
  })
})

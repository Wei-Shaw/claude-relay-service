jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  debug: jest.fn()
}))

const openaiToClaude = require('../src/services/openaiToClaude')

describe('openaiToClaude tool_result aggregation', () => {
  test('merges consecutive OpenAI tool messages into a single Claude user message with multiple tool_result blocks', () => {
    const req = {
      model: 'claude-opus-4-7',
      stream: false,
      messages: [
        { role: 'user', content: 'Call both tools.' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'toolu_a',
              type: 'function',
              function: { name: 'get_x', arguments: '{}' }
            },
            {
              id: 'toolu_b',
              type: 'function',
              function: { name: 'get_y', arguments: '{}' }
            }
          ]
        },
        { role: 'tool', tool_call_id: 'toolu_a', content: 'x=1' },
        { role: 'tool', tool_call_id: 'toolu_b', content: 'y=2' }
      ]
    }

    const converted = openaiToClaude.convertRequest(req)

    expect(converted.messages).toHaveLength(3)
    expect(converted.messages[2]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_a',
          content: 'x=1'
        },
        {
          type: 'tool_result',
          tool_use_id: 'toolu_b',
          content: 'y=2'
        }
      ]
    })
  })

  test('flushes aggregated tool results before the next real user message', () => {
    const req = {
      model: 'claude-opus-4-7',
      stream: false,
      messages: [
        { role: 'user', content: 'Call both tools.' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'toolu_a',
              type: 'function',
              function: { name: 'get_x', arguments: '{}' }
            },
            {
              id: 'toolu_b',
              type: 'function',
              function: { name: 'get_y', arguments: '{}' }
            }
          ]
        },
        { role: 'tool', tool_call_id: 'toolu_a', content: 'x=1' },
        { role: 'tool', tool_call_id: 'toolu_b', content: 'y=2' },
        { role: 'user', content: 'Now explain the results.' }
      ]
    }

    const converted = openaiToClaude.convertRequest(req)

    expect(converted.messages).toEqual([
      { role: 'user', content: 'Call both tools.' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'toolu_a', name: 'get_x', input: {} },
          { type: 'tool_use', id: 'toolu_b', name: 'get_y', input: {} }
        ]
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_a', content: 'x=1' },
          { type: 'tool_result', tool_use_id: 'toolu_b', content: 'y=2' }
        ]
      },
      { role: 'user', content: 'Now explain the results.' }
    ])
  })
})

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

const converter = require('../src/services/openaiToClaude')

describe('OpenAIToClaudeConverter', () => {
  it('should treat empty replayed tool arguments as an empty object', () => {
    const converted = converter.convertRequest({
      model: 'claude-opus-4-1',
      messages: [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'toolu_empty',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: ''
              }
            }
          ]
        }
      ]
    })

    expect(converted.messages).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_empty',
            name: 'get_weather',
            input: {}
          }
        ]
      }
    ])
  })

  it('should preserve malformed replayed tool arguments in _raw', () => {
    const converted = converter.convertRequest({
      model: 'claude-opus-4-1',
      messages: [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'toolu_bad',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{bad json'
              }
            }
          ]
        }
      ]
    })

    expect(converted.messages).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_bad',
            name: 'get_weather',
            input: { _raw: '{bad json' }
          }
        ]
      }
    ])
  })
})

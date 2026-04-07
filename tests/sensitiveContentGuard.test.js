jest.mock('../src/utils/logger', () => ({
  security: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn()
}))

const logger = require('../src/utils/logger')
const sensitiveContentGuard = require('../src/middleware/sensitiveContentGuard')

function createResponse() {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  }
  res.status.mockReturnValue(res)
  return res
}

describe('sensitiveContentGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects requests containing nested OpenAI API keys', () => {
    const req = {
      body: {
        messages: [
          {
            role: 'user',
            content: 'use this key sk-proj-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN'
          }
        ]
      },
      apiKey: { id: 'key_123' },
      originalUrl: '/openai/v1/responses'
    }
    const res = createResponse()
    const next = jest.fn()

    sensitiveContentGuard(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'Request contains sensitive credentials and was rejected',
        type: 'sensitive_content_detected',
        code: 'sensitive_content_detected',
        detectedTypes: ['openai_api_key']
      }
    })
    expect(logger.security).toHaveBeenCalledWith(
      expect.stringContaining('detectedTypes=openai_api_key')
    )
    expect(logger.security).not.toHaveBeenCalledWith(
      expect.stringContaining('sk-proj-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN')
    )
  })

  it('rejects requests containing SSH private keys', () => {
    const req = {
      body: {
        prompt: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----'
      },
      apiKey: { id: 'key_456' },
      originalUrl: '/api/v1/messages'
    }
    const res = createResponse()
    const next = jest.fn()

    sensitiveContentGuard(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'Request contains sensitive credentials and was rejected',
        type: 'sensitive_content_detected',
        code: 'sensitive_content_detected',
        detectedTypes: ['ssh_private_key']
      }
    })
  })

  it('allows benign requests to continue', () => {
    const req = {
      body: {
        messages: [{ role: 'user', content: 'hello world' }]
      },
      apiKey: { id: 'key_ok' },
      originalUrl: '/api/v1/messages'
    }
    const res = createResponse()
    const next = jest.fn()

    sensitiveContentGuard(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
    expect(logger.security).not.toHaveBeenCalled()
  })

  it('allows Codex-style payloads containing benign 40-character identifiers', () => {
    const req = {
      body: {
        model: 'gpt-5.4',
        instructions: 'You are Codex, a coding agent based on GPT-5.',
        input: [
          {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'tracking id: ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcd'
              }
            ]
          }
        ]
      },
      apiKey: { id: 'key_codex' },
      originalUrl: '/openai/v1/responses'
    }
    const res = createResponse()
    const next = jest.fn()

    sensitiveContentGuard(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
    expect(logger.security).not.toHaveBeenCalled()
  })

  it('rejects contextual AWS secret access keys', () => {
    const req = {
      body: {
        aws_secret_access_key: 'abcdABCD1234+/abcdABCD1234+/abcdABCD1234'
      },
      apiKey: { id: 'key_aws' },
      originalUrl: '/openai/v1/responses'
    }
    const res = createResponse()
    const next = jest.fn()

    sensitiveContentGuard(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'Request contains sensitive credentials and was rejected',
        type: 'sensitive_content_detected',
        code: 'sensitive_content_detected',
        detectedTypes: ['aws_secret_key']
      }
    })
  })

  it('allows Codex payloads when only instructions, assistant history, or tools contain example secrets', () => {
    const req = {
      body: {
        model: 'gpt-5.4',
        instructions:
          'Example values: sk-ant-example1234567890 and -----BEGIN OPENSSH PRIVATE KEY-----',
        tools: [
          {
            type: 'function',
            name: 'debug',
            parameters: {
              type: 'object',
              properties: {
                apiKeyExample: {
                  type: 'string',
                  description: 'Example OpenAI key sk-proj-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN'
                }
              }
            }
          }
        ],
        input: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Historical example AWS secret: aws_secret_access_key=abcdABCD1234+/abcdABCD1234+/abcdABCD1234'
              }
            ]
          },
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Please help me inspect the build logs.' }]
          }
        ]
      },
      apiKey: { id: 'key_codex_history' },
      originalUrl: '/openai/v1/responses'
    }
    const res = createResponse()
    const next = jest.fn()

    sensitiveContentGuard(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
    expect(logger.security).not.toHaveBeenCalled()
  })

  it('rejects Codex payloads when the user input contains a real secret', () => {
    const req = {
      body: {
        model: 'gpt-5.4',
        instructions: 'You are Codex, a coding agent based on GPT-5.',
        input: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'I can help inspect this.' }]
          },
          {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Please use this key sk-proj-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN'
              }
            ]
          }
        ]
      },
      apiKey: { id: 'key_codex_secret' },
      originalUrl: '/openai/v1/responses'
    }
    const res = createResponse()
    const next = jest.fn()

    sensitiveContentGuard(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'Request contains sensitive credentials and was rejected',
        type: 'sensitive_content_detected',
        code: 'sensitive_content_detected',
        detectedTypes: ['openai_api_key']
      }
    })
  })

  it('skips admin routes so account management payloads are not blocked', () => {
    const req = {
      body: {
        apiKey: 'sk-ant-admin-secret'
      },
      apiKey: { id: 'admin_key' },
      originalUrl: '/admin/openai-accounts'
    }
    const res = createResponse()
    const next = jest.fn()

    sensitiveContentGuard(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })
})

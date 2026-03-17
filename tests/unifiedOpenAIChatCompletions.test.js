const express = require('express')
const request = require('supertest')

jest.mock('../src/middleware/auth', () => ({
  authenticateApiKey: (req, _res, next) => {
    req.apiKey = {
      id: 'key-1',
      permissions: ['openai']
    }
    next()
  }
}))

jest.mock('../src/services/apiKeyService', () => ({
  hasPermission: jest.fn(() => true)
}))

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

jest.mock('../src/routes/openaiClaudeRoutes', () => ({
  handleChatCompletion: jest.fn()
}))

jest.mock('../src/handlers/geminiHandlers', () => ({
  handleStandardGenerateContent: jest.fn(),
  handleStandardStreamGenerateContent: jest.fn()
}))

jest.mock('../src/routes/openaiRoutes', () => ({
  handleResponses: jest.fn(),
  CODEX_CLI_INSTRUCTIONS: 'codex-cli-instructions'
}))

const openaiRoutes = require('../src/routes/openaiRoutes')
const unifiedRoutes = require('../src/routes/unified')

const buildApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/openai', unifiedRoutes)
  app.use('/api', unifiedRoutes)
  return app
}

describe('unified OpenAI chat/completions stream support', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses SSE path when stream=true is explicitly requested', async () => {
    openaiRoutes.handleResponses.mockImplementationOnce(async (req, res) => {
      res.status(200)
      res.setHeader('Content-Type', 'text/event-stream')
      res.write(
        `data: ${JSON.stringify({
          type: 'response.created',
          response: {
            id: 'resp_stream',
            created_at: 1710000000,
            model: 'gpt-5'
          }
        })}\n\n`
      )
      res.write(
        `data: ${JSON.stringify({
          type: 'response.output_text.delta',
          delta: 'hello'
        })}\n\n`
      )
      res.end(
        `data: ${JSON.stringify({
          type: 'response.completed',
          response: {
            id: 'resp_stream',
            created_at: 1710000000,
            model: 'gpt-5',
            status: 'completed',
            usage: {
              input_tokens: 1,
              output_tokens: 1,
              total_tokens: 2
            }
          }
        })}\n\n`
      )
    })

    const app = buildApp()
    const response = await request(app)
      .post('/openai/v1/chat/completions')
      .send({
        model: 'gpt-5',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true
      })

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('text/event-stream')
    expect(response.text).toContain('"object":"chat.completion.chunk"')
    expect(response.text).toContain('data: [DONE]')

    const forwardedReq = openaiRoutes.handleResponses.mock.calls[0][0]
    expect(forwardedReq.body.stream).toBe(true)
    expect(forwardedReq.url).toBe('/v1/responses')
    expect(forwardedReq._fromUnifiedEndpoint).toBe(true)
  })

  it('returns JSON path when stream=false is explicitly requested', async () => {
    openaiRoutes.handleResponses.mockImplementationOnce(async (_req, res) => {
      res.status(200).json({
        object: 'response',
        id: 'resp_json',
        created_at: 1710000000,
        status: 'completed',
        model: 'gpt-5',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'pong' }]
          }
        ],
        usage: {
          input_tokens: 2,
          output_tokens: 3,
          total_tokens: 5
        }
      })
    })

    const app = buildApp()
    const response = await request(app)
      .post('/api/v1/chat/completions')
      .send({
        model: 'gpt-5',
        messages: [{ role: 'user', content: 'ping' }],
        stream: false
      })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      object: 'chat.completion',
      model: 'gpt-5'
    })
    expect(response.body.choices[0].message.content).toBe('pong')

    const forwardedReq = openaiRoutes.handleResponses.mock.calls[0][0]
    expect(forwardedReq.body.stream).toBe(false)
    expect(forwardedReq.url).toBe('/v1/responses')
  })

  it('defaults chat completions to non-stream JSON when stream is omitted', async () => {
    openaiRoutes.handleResponses.mockImplementationOnce(async (_req, res) => {
      res.status(200).json({
        object: 'response',
        id: 'resp_default',
        created_at: 1710000000,
        status: 'completed',
        model: 'gpt-5',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'default json' }]
          }
        ],
        usage: {
          input_tokens: 2,
          output_tokens: 1,
          total_tokens: 3
        }
      })
    })

    const app = buildApp()
    const response = await request(app)
      .post('/openai/v1/chat/completions')
      .send({
        model: 'gpt-5',
        messages: [{ role: 'user', content: 'no stream field' }]
      })

    expect(response.status).toBe(200)
    expect(response.body.object).toBe('chat.completion')
    expect(response.body.choices[0].message.content).toBe('default json')

    const forwardedReq = openaiRoutes.handleResponses.mock.calls[0][0]
    expect(forwardedReq.body.stream).toBe(false)
  })
})

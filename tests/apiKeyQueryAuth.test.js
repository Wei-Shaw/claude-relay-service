const express = require('express')
const request = require('supertest')

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  security: jest.fn(),
  api: jest.fn()
}))
jest.mock('../src/models/redis', () => ({}))
jest.mock('../src/services/apiKeyService', () => ({
  validateApiKey: jest.fn()
}))
jest.mock('../src/services/userService', () => ({}))
jest.mock('../src/services/claudeRelayConfigService', () => ({}))

const apiKeyService = require('../src/services/apiKeyService')
const { authenticateApiKey } = require('../src/middleware/auth')

describe('API key query-string authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not accept API keys from the key query parameter', async () => {
    const app = express()
    app.post('/api/v1/messages', authenticateApiKey, (req, res) => {
      res.json({ success: true })
    })

    const response = await request(app).post('/api/v1/messages?key=query-secret')

    expect(response.status).toBe(401)
    expect(response.body.error).toBe('Missing API key')
    expect(apiKeyService.validateApiKey).not.toHaveBeenCalled()
  })
})

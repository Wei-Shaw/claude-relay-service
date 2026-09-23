/* eslint-env jest */

const express = require('express')
const request = require('supertest')

const mockAuthenticateApiKey = jest.fn((req, res, next) => {
  req.apiKey = { id: 'key-1', permissions: 'all' }
  next()
})

jest.mock('../src/middleware/auth', () => ({
  authenticateApiKey: (req, res, next) => mockAuthenticateApiKey(req, res, next)
}))
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  error: jest.fn()
}))

const mockHandleCodexModels = jest.fn((req, res) => res.json({ via: 'codex' }))
jest.mock('../src/routes/openaiRoutes', () => ({
  handleCodexModels: (req, res) => mockHandleCodexModels(req, res)
}))

const compatibilityRoutes = require('../src/routes/codexModelsCompatibility')

const buildApp = () => {
  const app = express()
  app.use(compatibilityRoutes)
  app.get('/api/v1/models', (req, res) => res.json({ via: 'static' }))
  app.use((req, res) => res.status(404).json({ error: 'not_found' }))
  return app
}

const codexRequest = (app, path) =>
  request(app).get(path).set('user-agent', 'codex_cli_rs/0.156.0').set('originator', 'codex_cli_rs')

describe('Codex model discovery compatibility routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each(['/models', '/v1/models', '/api/models', '/api/v1/models'])(
    'serves the OAuth-backed catalog at %s',
    async (path) => {
      const res = await codexRequest(buildApp(), `${path}?client_version=0.156.0`)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ via: 'codex' })
      expect(mockAuthenticateApiKey).toHaveBeenCalledTimes(1)
      expect(mockHandleCodexModels).toHaveBeenCalledTimes(1)
    }
  )

  it('preserves the existing /api/v1/models route for non-Codex clients', async () => {
    const res = await request(buildApp()).get('/api/v1/models').set('user-agent', 'curl/8.0')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ via: 'static' })
    expect(mockAuthenticateApiKey).not.toHaveBeenCalled()
    expect(mockHandleCodexModels).not.toHaveBeenCalled()
  })

  it('does not expose new root aliases to non-Codex clients', async () => {
    const res = await request(buildApp()).get('/v1/models').set('user-agent', 'curl/8.0')

    expect(res.status).toBe(404)
    expect(mockAuthenticateApiKey).not.toHaveBeenCalled()
    expect(mockHandleCodexModels).not.toHaveBeenCalled()
  })
})

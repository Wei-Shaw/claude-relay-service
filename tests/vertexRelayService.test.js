jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  performance: jest.fn(),
  api: jest.fn()
}))

jest.mock('../config/config', () => ({
  requestTimeout: 60000
}))

jest.mock('../src/services/userMessageQueueService', () => ({
  isUserMessageRequest: jest.fn(() => false),
  acquireQueueLock: jest.fn(),
  releaseQueueLock: jest.fn()
}))

jest.mock('../src/utils/upstreamErrorHelper', () => ({
  markTempUnavailable: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('../src/utils/proxyHelper', () => ({
  createProxyAgent: jest.fn(() => null)
}))

jest.mock('../src/services/account/vertexAccountService', () => ({
  getAccessToken: jest.fn().mockResolvedValue('fake-access-token')
}))

jest.mock('axios', () => jest.fn())
const axios = require('axios')

const vertexRelayService = require('../src/services/relay/vertexRelayService')

describe('vertexRelayService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('_stripModelSuffix', () => {
    it('removes the @<date> suffix', () => {
      expect(vertexRelayService._stripModelSuffix('claude-opus-4-1@20250805')).toBe(
        'claude-opus-4-1'
      )
      expect(vertexRelayService._stripModelSuffix('claude-sonnet-4-5@20250929')).toBe(
        'claude-sonnet-4-5'
      )
    })

    it('returns the original when no suffix', () => {
      expect(vertexRelayService._stripModelSuffix('claude-opus-4-1')).toBe('claude-opus-4-1')
    })

    it('handles empty / null safely', () => {
      expect(vertexRelayService._stripModelSuffix(null)).toBe(null)
      expect(vertexRelayService._stripModelSuffix('')).toBe('')
    })
  })

  describe('_buildEndpointUrl', () => {
    it('encodes the model id (with @) for streaming', () => {
      const url = vertexRelayService._buildEndpointUrl({
        projectId: 'proj-1',
        region: 'us-east5',
        modelId: 'claude-opus-4-1@20250805',
        stream: true
      })
      expect(url).toBe(
        'https://us-east5-aiplatform.googleapis.com/v1/projects/proj-1/locations/us-east5/publishers/anthropic/models/claude-opus-4-1%4020250805:streamRawPredict'
      )
    })

    it('uses rawPredict for non-stream', () => {
      const url = vertexRelayService._buildEndpointUrl({
        projectId: 'proj-2',
        region: 'us-central1',
        modelId: 'claude-sonnet-4-5@20250929',
        stream: false
      })
      expect(url).toContain(':rawPredict')
      expect(url).toContain('us-central1-aiplatform.googleapis.com')
    })
  })

  describe('_convertToVertexFormat', () => {
    it('removes model and adds anthropic_version', () => {
      const out = vertexRelayService._convertToVertexFormat({
        model: 'claude-opus-4-1@20250805',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }]
      })
      expect(out.model).toBeUndefined()
      expect(out.anthropic_version).toBe('vertex-2023-10-16')
      expect(out.max_tokens).toBe(100)
      expect(out.messages).toEqual([{ role: 'user', content: 'hi' }])
    })

    it('applies default max_tokens when not provided', () => {
      const out = vertexRelayService._convertToVertexFormat({
        messages: [{ role: 'user', content: 'hi' }]
      })
      expect(out.max_tokens).toBeGreaterThan(0)
    })
  })

  describe('handleNonStreamRequest', () => {
    it('forwards to Vertex with stripped model in usage record', async () => {
      axios.mockResolvedValue({
        status: 200,
        data: {
          id: 'msg_123',
          type: 'message',
          model: 'claude-opus-4-1@20250805',
          content: [{ type: 'text', text: 'hello' }],
          usage: { input_tokens: 5, output_tokens: 7 }
        }
      })

      const account = {
        id: 'acc-1',
        name: 'v-acc',
        projectId: 'proj-x',
        region: 'us-east5',
        defaultModel: 'claude-opus-4-1@20250805'
      }

      const result = await vertexRelayService.handleNonStreamRequest(
        {
          model: 'claude-opus-4-1@20250805',
          max_tokens: 200,
          messages: [{ role: 'user', content: 'hi' }]
        },
        account
      )

      expect(result.success).toBe(true)
      // The model returned for usage recording must be the stripped form
      expect(result.model).toBe('claude-opus-4-1')
      expect(result.usage).toEqual({ input_tokens: 5, output_tokens: 7 })

      // Verify the outbound request shape
      expect(axios).toHaveBeenCalledTimes(1)
      const call = axios.mock.calls[0][0]
      expect(call.method).toBe('POST')
      expect(call.url).toContain(
        'us-east5-aiplatform.googleapis.com/v1/projects/proj-x/locations/us-east5/publishers/anthropic/models/'
      )
      expect(call.url).toContain(':rawPredict')
      expect(call.headers.Authorization).toBe('Bearer fake-access-token')
      // The request body sent to Vertex should NOT contain a `model` field but SHOULD contain anthropic_version
      expect(call.data.model).toBeUndefined()
      expect(call.data.anthropic_version).toBe('vertex-2023-10-16')
      expect(call.data.max_tokens).toBe(200)
    })

    it('throws when account is missing projectId', async () => {
      await expect(
        vertexRelayService.handleNonStreamRequest(
          {
            model: 'claude-opus-4-1@20250805',
            messages: [{ role: 'user', content: 'hi' }]
          },
          { id: 'acc-no-proj', region: 'us-east5' }
        )
      ).rejects.toThrow(/missing projectId/)
    })

    it('marks account temporarily unavailable on 429 upstream', async () => {
      const upstreamErrorHelper = require('../src/utils/upstreamErrorHelper')
      axios.mockResolvedValue({
        status: 429,
        data: 'Too many requests'
      })

      await expect(
        vertexRelayService.handleNonStreamRequest(
          {
            model: 'claude-opus-4-1@20250805',
            messages: [{ role: 'user', content: 'hi' }]
          },
          {
            id: 'acc-rate',
            projectId: 'proj-r',
            region: 'us-east5',
            defaultModel: 'claude-opus-4-1@20250805'
          }
        )
      ).rejects.toThrow(/Vertex upstream error 429/)

      expect(upstreamErrorHelper.markTempUnavailable).toHaveBeenCalledWith(
        'acc-rate',
        'vertex',
        429
      )
    })
  })
})

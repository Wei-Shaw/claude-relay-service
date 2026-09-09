// unifiedRoutes 和 openaiRoutes 都挂在 /openai 前缀下，且 unified 在前
// (src/app.js)。所以 unified 的 POST /v1/responses 只能接管 Grok 模型，其余必须
// next() 交回给后面的 openaiRoutes —— 那里才是 Codex 的 /openai/v1/responses。
// 一旦这里直接返回错误，所有 Codex 客户端都会被打挂。
//
// 鉴权也必须留在「确认是 Grok」之后：authenticateApiKey 每次调用都会用新的
// requestId 占一个并发槽位，非 Grok 请求若在这里先认证一次、再由 openaiRoutes
// 认证一次，该 Key 的有效并发上限会直接减半。

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
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  api: jest.fn(),
  success: jest.fn(),
  security: jest.fn()
}))
const mockHandleChatCompletion = jest.fn((req, res) => res.json({ via: 'claude' }))
jest.mock('../src/routes/openaiClaudeRoutes', () => ({
  handleChatCompletion: (...args) => mockHandleChatCompletion(...args)
}))
jest.mock('../src/handlers/geminiHandlers', () => ({
  handleStandardGenerateContent: jest.fn(),
  handleStandardStreamGenerateContent: jest.fn()
}))
jest.mock('../src/routes/openaiRoutes', () => ({
  handleResponses: jest.fn(),
  CODEX_CLI_INSTRUCTIONS: ''
}))
const mockHasPermission = jest.fn(() => true)
jest.mock('../src/services/apiKeyService', () => ({
  hasPermission: (...args) => mockHasPermission(...args)
}))
jest.mock('../src/services/geminiToOpenAI', () => jest.fn())
jest.mock('../src/services/codexToOpenAI', () => jest.fn())

const mockGrokHandleRequest = jest.fn((req, res) => res.json({ via: 'grok' }))
jest.mock('../src/services/relay/grokRelayService', () => ({
  handleRequest: (...args) => mockGrokHandleRequest(...args)
}))
const mockSelectAccount = jest.fn(async () => ({ id: 'grok-1' }))
jest.mock('../src/services/scheduler/grokScheduler', () => ({
  selectAccount: (...args) => mockSelectAccount(...args)
}))
jest.mock('../src/services/account/grokAccountService', () => ({
  INDEX_KEY: 'grok_account:index',
  ACCOUNT_KEY_PREFIX: 'grok_account:'
}))
const mockGetAllIdsByIndex = jest.fn(async () => ['grok-1'])
jest.mock('../src/models/redis', () => ({
  getAllIdsByIndex: (...args) => mockGetAllIdsByIndex(...args)
}))

const unifiedRoutes = require('../src/routes/unified')

// 复刻 app.js 的挂载顺序：unified 在前，openaiRoutes 紧随其后
const codexHandler = jest.fn((req, res) => res.json({ via: 'codex' }))
const buildApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/openai', unifiedRoutes)

  const openaiRouter = express.Router()
  openaiRouter.post('/v1/responses', (req, res, next) =>
    mockAuthenticateApiKey(req, res, () => codexHandler(req, res, next))
  )
  app.use('/openai', openaiRouter)

  app.use((req, res) => res.status(404).json({ error: 'not_found' }))
  return app
}

describe('unified POST /v1/responses', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each([['gpt-5-codex'], ['gpt-5'], ['claude-sonnet-4-5'], ['o3']])(
    'falls through to the Codex handler for %s',
    async (model) => {
      const res = await request(buildApp()).post('/openai/v1/responses').send({ model })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ via: 'codex' })
      expect(codexHandler).toHaveBeenCalledTimes(1)
      expect(mockGrokHandleRequest).not.toHaveBeenCalled()
    }
  )

  it('falls through when the body carries no model at all', async () => {
    const res = await request(buildApp()).post('/openai/v1/responses').send({})

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ via: 'codex' })
  })

  it('authenticates exactly once for a pass-through request', async () => {
    await request(buildApp()).post('/openai/v1/responses').send({ model: 'gpt-5-codex' })

    expect(mockAuthenticateApiKey).toHaveBeenCalledTimes(1)
  })

  it.each([['grok-4.5'], ['xai/grok-4']])('still relays %s to Grok', async (model) => {
    const res = await request(buildApp()).post('/openai/v1/responses').send({ model })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ via: 'grok' })
    expect(mockGrokHandleRequest).toHaveBeenCalledTimes(1)
    expect(mockAuthenticateApiKey).toHaveBeenCalledTimes(1)
    expect(codexHandler).not.toHaveBeenCalled()
  })
})

// grok-* 在本平台支持 Grok 之前落到 claude 分支（claude-console / CCR 中转 grok
// 模型是既有用法）。只有确实配置了 Grok 账户时才接管，否则按老路走 claude。
describe('unified POST /v1/chat/completions - Grok 接管的前提', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockHasPermission.mockReturnValue(true)
    mockGetAllIdsByIndex.mockResolvedValue(['grok-1'])
    mockSelectAccount.mockResolvedValue({ id: 'grok-1' })
  })

  const postGrok = () =>
    request(buildApp())
      .post('/openai/v1/chat/completions')
      .send({ model: 'grok-4.5', messages: [{ role: 'user', content: 'hi' }] })

  it('没有配置任何 Grok 账户时回落到 Claude', async () => {
    mockGetAllIdsByIndex.mockResolvedValue([])

    const res = await postGrok()

    expect(res.body).toEqual({ via: 'claude' })
    expect(mockHandleChatCompletion).toHaveBeenCalledTimes(1)
    expect(mockGrokHandleRequest).not.toHaveBeenCalled()
    // 回落路径不能去选账户：selectAccount 会写 sticky session 并 touch lastUsedAt
    expect(mockSelectAccount).not.toHaveBeenCalled()
  })

  it('回落时仍然按 claude 权限判定，不会绕过鉴权', async () => {
    mockGetAllIdsByIndex.mockResolvedValue([])
    mockHasPermission.mockImplementation((_perms, service) => service !== 'claude')

    const res = await postGrok()

    expect(res.status).toBe(403)
    expect(mockHandleChatCompletion).not.toHaveBeenCalled()
  })

  it('配置了 Grok 账户就正常接管', async () => {
    const res = await postGrok()

    expect(res.body).toEqual({ via: 'grok' })
    expect(mockSelectAccount).toHaveBeenCalledTimes(1)
    expect(mockHandleChatCompletion).not.toHaveBeenCalled()
  })

  // 权限校验必须在 selectAccount 之前：后者会写 sticky session 映射并 touch
  // lastUsedAt，让一个最终要被 403 的请求先产生这些副作用是错的。
  it('有账户但 Key 没有 grok 权限时返回 403，且不产生选号副作用', async () => {
    mockHasPermission.mockImplementation((_perms, service) => service !== 'grok')

    const res = await postGrok()

    expect(res.status).toBe(403)
    expect(mockSelectAccount).not.toHaveBeenCalled()
    expect(mockGrokHandleRequest).not.toHaveBeenCalled()
    expect(mockHandleChatCompletion).not.toHaveBeenCalled()
  })

  // 账户存在但此刻全被限流：必须照常报错，不能让 Grok 请求被 Claude 静默应答。
  // 状态码是 500 而不是 402 —— 这是 /v1/chat/completions 的 catch 一律返回 500 的
  // 既有行为（main 上对 claude/gemini/openai 也一样会吞掉 error.statusCode），
  // 与本次改动无关，这里只钉住「不回落」这个语义。
  it('账户全部不可用时照常报错，不改道 Claude', async () => {
    const err = new Error('No available Grok accounts')
    err.statusCode = 402
    mockSelectAccount.mockRejectedValue(err)

    const res = await postGrok()

    expect(res.status).toBe(500)
    expect(mockHandleChatCompletion).not.toHaveBeenCalled()
    expect(mockGrokHandleRequest).not.toHaveBeenCalled()
  })
})

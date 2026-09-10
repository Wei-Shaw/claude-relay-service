jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  api: jest.fn()
}))

jest.mock('../src/models/redis', () => ({}))

// 这些依赖在 require 阶段会建连接/起定时器，测试只关心请求体处理，全部置空
jest.mock('../src/utils/proxyHelper', () => ({}))
jest.mock('../src/utils/sessionHelper', () => ({}))
jest.mock('../src/utils/upstreamErrorHelper', () => ({}))
jest.mock('../src/utils/testPayloadHelper', () => ({ createClaudeTestPayload: jest.fn() }))
jest.mock('../src/services/account/claudeAccountService', () => ({}))
jest.mock('../src/services/scheduler/unifiedClaudeScheduler', () => ({}))
jest.mock('../src/services/claudeCodeHeadersService', () => ({}))
jest.mock('../src/services/requestIdentityService', () => ({}))
jest.mock('../src/services/userMessageQueueService', () => ({}))

const claudeRelayService = require('../src/services/relay/claudeRelayService')

const BILLING_HEADER = {
  type: 'text',
  text: 'x-anthropic-billing-header: cc_version=2.1.233.931; cc_entrypoint=sdk-ts;'
}
const CLAUDE_CODE_IDENTITY = {
  type: 'text',
  text: "You are Claude Code, Anthropic's official CLI for Claude."
}
const AUXILIARY_PROMPT = {
  type: 'text',
  text: 'You are a security monitor for autonomous AI coding agents.'
}

const bodyWithSystem = (system) => ({
  model: 'claude-opus-5',
  max_tokens: 64,
  system,
  messages: [{ role: 'user', content: 'hi' }]
})

describe('claudeRelayService.isRealClaudeCodeRequest with billing header', () => {
  it('ignores a lone billing header block', () => {
    expect(claudeRelayService.isRealClaudeCodeRequest(bodyWithSystem([BILLING_HEADER]))).toBe(false)
  })

  it('rejects auxiliary requests whose only recognized block is the billing header', () => {
    const body = bodyWithSystem([BILLING_HEADER, AUXILIARY_PROMPT])
    expect(claudeRelayService.isRealClaudeCodeRequest(body)).toBe(false)
  })

  it('still accepts real Claude Code requests carrying a billing header', () => {
    const body = bodyWithSystem([BILLING_HEADER, CLAUDE_CODE_IDENTITY])
    expect(claudeRelayService.isRealClaudeCodeRequest(body)).toBe(true)
  })

  it('still accepts real Claude Code requests without a billing header', () => {
    expect(claudeRelayService.isRealClaudeCodeRequest(bodyWithSystem([CLAUDE_CODE_IDENTITY]))).toBe(
      true
    )
  })

  it('does not mutate the caller request body', () => {
    const body = bodyWithSystem([BILLING_HEADER, AUXILIARY_PROMPT])
    claudeRelayService.isRealClaudeCodeRequest(body)
    expect(body.system).toHaveLength(2)
    expect(body.system[0]).toBe(BILLING_HEADER)
  })
})

describe('claudeRelayService._processRequestBody keeps a Claude Code identity upstream', () => {
  const identityText = (system) => {
    if (typeof system === 'string') {
      return system
    }
    return Array.isArray(system) ? system.map((item) => item && item.text).join('\n') : ''
  }

  it('injects the Claude Code prompt for billing-header-only auxiliary requests', () => {
    const body = bodyWithSystem([BILLING_HEADER, AUXILIARY_PROMPT])
    const isRealClaudeCode = claudeRelayService.isRealClaudeCodeRequest(body)
    const processed = claudeRelayService._processRequestBody(body, null, isRealClaudeCode)

    expect(identityText(processed.system)).toContain(
      "You are Claude Code, Anthropic's official CLI"
    )
    expect(identityText(processed.system)).not.toContain('x-anthropic-billing-header')
    // 原始 system 指令被迁移到 messages，模型仍能收到完整指令
    expect(JSON.stringify(processed.messages)).toContain('security monitor for autonomous')
  })

  it('leaves real Claude Code requests with their own identity block', () => {
    const body = bodyWithSystem([BILLING_HEADER, CLAUDE_CODE_IDENTITY, AUXILIARY_PROMPT])
    const isRealClaudeCode = claudeRelayService.isRealClaudeCodeRequest(body)
    const processed = claudeRelayService._processRequestBody(body, null, isRealClaudeCode)

    expect(processed.system[0].text).toBe(CLAUDE_CODE_IDENTITY.text)
    expect(identityText(processed.system)).not.toContain('x-anthropic-billing-header')
  })
})

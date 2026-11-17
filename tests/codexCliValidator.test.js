jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

const CodexCliValidator = require('../src/validators/clients/codexCliValidator')

function codexRequest(headers) {
  return {
    path: '/openai/responses',
    headers: {
      'user-agent': 'codex_cli_rs/0.166.0 (Mac OS 26.3.0; arm64) xterm-256color',
      originator: 'codex_cli_rs',
      ...headers
    },
    body: {
      instructions:
        "You are Codex, based on GPT-5. You are running as a coding agent in the Codex CLI on a user's computer."
    }
  }
}

describe('CodexCliValidator session header', () => {
  const sessionId = '01a1e2fb-d428-7ca2-be9a-cba9c98362a6'

  it('accepts the legacy session_id header', () => {
    expect(CodexCliValidator.validate(codexRequest({ session_id: sessionId }))).toBe(true)
  })

  it('accepts the session-id header sent by current Codex clients', () => {
    expect(CodexCliValidator.validate(codexRequest({ 'session-id': sessionId }))).toBe(true)
  })

  it('rejects requests without a session header', () => {
    expect(CodexCliValidator.validate(codexRequest({}))).toBe(false)
  })
})

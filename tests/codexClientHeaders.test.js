const {
  parseCodexClientUserAgent,
  isCodexClientUserAgent,
  extractCodexSessionId
} = require('../src/utils/codexClientHeaders')

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  error: jest.fn()
}))

const CodexCliValidator = require('../src/validators/clients/codexCliValidator')

const CODEX_INSTRUCTIONS =
  "You are Codex, based on GPT-5. You are running as a coding agent in the Codex CLI on a user's computer."

function buildRequest(overrides = {}) {
  const { headers = {}, body = {}, ...rest } = overrides

  return {
    path: '/openai/responses',
    headers: {
      'user-agent': 'codex-tui/0.115.0 (Mac OS 26.3.1; arm64) iTerm.app/3.6.9 (codex-tui; 0.115.0)',
      originator: 'codex-tui',
      session_id: '019d05d6-cba7-7fe1-b4db-35cbdc8914b2',
      ...headers
    },
    body: {
      instructions: CODEX_INSTRUCTIONS,
      model: 'gpt-5-codex',
      ...body
    },
    ...rest
  }
}

describe('codexClientHeaders', () => {
  it('parses codex-tui user agents', () => {
    expect(
      parseCodexClientUserAgent(
        'codex-tui/0.115.0 (Mac OS 26.3.1; arm64) iTerm.app/3.6.9 (codex-tui; 0.115.0)'
      )
    ).toEqual({
      originator: 'codex-tui',
      version: '0.115.0'
    })
  })

  it('parses Codex Desktop prerelease user agents', () => {
    expect(
      parseCodexClientUserAgent(
        'Codex Desktop/0.116.0-alpha.1 (Mac OS 26.3.1; arm64) unknown (Codex Desktop; 26.317.21539)'
      )
    ).toEqual({
      originator: 'Codex Desktop',
      version: '0.116.0-alpha.1'
    })
  })

  it('detects supported and unsupported Codex clients', () => {
    expect(isCodexClientUserAgent('codex_vscode/0.115.0 (Mac OS 26.3.1; arm64)')).toBe(true)
    expect(isCodexClientUserAgent('curl/8.7.1')).toBe(false)
  })

  it('falls back to x-client-request-id when session_id is unavailable', () => {
    expect(
      extractCodexSessionId(
        {
          'x-client-request-id': '019d05da-2538-73b0-a19f-673428f26d0b'
        },
        {}
      )
    ).toBe('019d05da-2538-73b0-a19f-673428f26d0b')
  })
})

describe('CodexCliValidator', () => {
  it('accepts codex-tui requests on strict OpenAI routes', () => {
    expect(CodexCliValidator.validate(buildRequest())).toBe(true)
  })

  it('accepts Codex Desktop requests with prerelease versions', () => {
    expect(
      CodexCliValidator.validate(
        buildRequest({
          headers: {
            'user-agent':
              'Codex Desktop/0.116.0-alpha.1 (Mac OS 26.3.1; arm64) unknown (Codex Desktop; 26.317.21539)',
            originator: 'Codex Desktop',
            session_id: '019d05da-2538-73b0-a19f-673428f26d0b'
          }
        })
      )
    ).toBe(true)
  })

  it('accepts x-client-request-id as the session fallback', () => {
    expect(
      CodexCliValidator.validate(
        buildRequest({
          headers: {
            session_id: undefined,
            'x-client-request-id': '019d05dc-2bf1-7731-b3bf-7004b9f75f28'
          }
        })
      )
    ).toBe(true)
  })

  it('rejects originator mismatches', () => {
    expect(
      CodexCliValidator.validate(
        buildRequest({
          headers: {
            originator: 'codex_vscode'
          }
        })
      )
    ).toBe(false)
  })
})

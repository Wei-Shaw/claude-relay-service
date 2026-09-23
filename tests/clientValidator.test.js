/* eslint-env jest */
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  error: jest.fn()
}))

const CodexCliValidator = require('../src/validators/clients/codexCliValidator')
const { isPathAllowedForClient } = require('../src/validators/clientDefinitions')

const codexHeaders = {
  'user-agent': 'codex_cli_rs/0.155.1 (Linux; x86_64)',
  originator: 'codex_cli_rs'
}

function createRequest(path, headers = {}, body = {}) {
  return {
    headers: { ...codexHeaders, ...headers },
    originalUrl: path,
    path,
    body
  }
}

describe('Codex client validation', () => {
  test.each([
    '/openai/images/generations',
    '/openai/v1/images/generations',
    '/openai/images/edits',
    '/openai/v1/images/edits',
    '/openai/models?client_version=0.155.1',
    '/openai/v1/models?client_version=0.156.0',
    '/models?client_version=0.156.0',
    '/v1/models?client_version=0.156.0',
    '/api/models?client_version=0.156.0',
    '/api/v1/models?client_version=0.156.0'
  ])('allows the Codex path %s', (path) => {
    expect(isPathAllowedForClient('codex_cli', path)).toBe(true)
  })

  test.each([
    '/openai/images/generations',
    '/openai/v1/images/generations',
    '/openai/images/edits',
    '/openai/v1/images/edits',
    '/openai/models?client_version=0.155.1',
    '/openai/v1/models?client_version=0.156.0',
    '/models?client_version=0.156.0',
    '/v1/models?client_version=0.156.0',
    '/api/models?client_version=0.156.0',
    '/api/v1/models?client_version=0.156.0'
  ])('allows the sessionless Codex request %s', (path) => {
    expect(CodexCliValidator.validate(createRequest(path))).toBe(true)
  })

  test('rejects a non-Codex user agent for model discovery', () => {
    expect(
      CodexCliValidator.validate(
        createRequest('/openai/models?client_version=0.155.1', {
          'user-agent': 'curl/8.0'
        })
      )
    ).toBe(false)
  })

  test('rejects a non-Codex user agent for versioned model discovery', () => {
    expect(
      CodexCliValidator.validate(
        createRequest('/openai/v1/models?client_version=0.156.0', {
          'user-agent': 'curl/8.0'
        })
      )
    ).toBe(false)
  })

  test('rejects an originator mismatch for sessionless requests', () => {
    expect(
      CodexCliValidator.validate(
        createRequest('/openai/images/generations', { originator: 'codex_exec' })
      )
    ).toBe(false)
  })

  test('does not grant sessionless validation to lookalike paths', () => {
    expect(CodexCliValidator.validate(createRequest('/openai/proxy/images/edits'))).toBe(false)
  })

  test('keeps Responses session validation strict', () => {
    expect(CodexCliValidator.validate(createRequest('/openai/responses'))).toBe(false)
  })
})

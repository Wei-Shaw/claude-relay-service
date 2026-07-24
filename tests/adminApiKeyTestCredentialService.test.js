jest.mock(
  '../config/config',
  () => ({
    security: {
      apiKeyPrefix: 'cr_'
    }
  }),
  { virtual: true }
)

const credentialService = require('../src/services/adminApiKeyTestCredentialService')

describe('admin API key test credentials', () => {
  test('issues a scoped credential that can only be consumed once', () => {
    const { apiKey } = credentialService.issueCredential('key-1', 'claude')

    expect(apiKey).toMatch(/^cr_[a-f0-9]{64}$/)
    expect(credentialService.peekCredential(apiKey, 'gemini')).toBeNull()
    expect(credentialService.peekCredential(apiKey, 'claude')).toEqual(
      expect.objectContaining({ keyId: 'key-1', service: 'claude' })
    )
    expect(credentialService.consumeCredential(apiKey, 'claude')).toEqual(
      expect.objectContaining({ keyId: 'key-1', service: 'claude' })
    )
    expect(credentialService.consumeCredential(apiKey, 'claude')).toBeNull()
  })

  test('rejects expired credentials', () => {
    const { apiKey } = credentialService.issueCredential('key-2', 'openai', -1)

    expect(credentialService.peekCredential(apiKey, 'openai')).toBeNull()
  })
})

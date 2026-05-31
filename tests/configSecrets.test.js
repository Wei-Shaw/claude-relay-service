const loadConfigWithEnv = (env) => {
  jest.resetModules()
  process.env = { ...process.env, ...env }
  return require('../config/config.example')
}

describe('production secret validation', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = originalEnv
    jest.resetModules()
  })

  it('rejects placeholder JWT secrets in production', () => {
    expect(() =>
      loadConfigWithEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'your-jwt-secret-here',
        ENCRYPTION_KEY: 'a'.repeat(32)
      })
    ).toThrow('JWT_SECRET must be set to a strong non-placeholder value in production')
  })

  it('rejects placeholder encryption keys in production', () => {
    expect(() =>
      loadConfigWithEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'a'.repeat(32),
        ENCRYPTION_KEY: 'your-encryption-key-here'
      })
    ).toThrow('ENCRYPTION_KEY must be set to a strong non-placeholder value in production')
  })

  it('allows strong production secrets', () => {
    const config = loadConfigWithEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'j'.repeat(32),
      ENCRYPTION_KEY: 'e'.repeat(32)
    })

    expect(config.security.jwtSecret).toBe('j'.repeat(32))
    expect(config.security.encryptionKey).toBe('e'.repeat(32))
  })
})

const { parse, extractSessionId, build, isValid } = require('../src/utils/metadataUserIdHelper')

const OLD_FORMAT =
  'user_d98385411c93cd074b2cefd5c9831fe77f24a53e4ecdcd1f830bba586fe62cb9_account__session_17cf0fd3-d51b-4b59-977d-b899dafb3022'

const OLD_FORMAT_WITH_UUID =
  'user_d98385411c93cd074b2cefd5c9831fe77f24a53e4ecdcd1f830bba586fe62cb9_account_abc-123_session_17cf0fd3-d51b-4b59-977d-b899dafb3022'

const JSON_FORMAT = JSON.stringify({
  device_id: 'd61f8a2c3b4e5f6071829a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f70810169',
  account_uuid: '',
  session_id: 'c72554f2-d198-4fd4-99c8-81e46410a1c5'
})

const JSON_FORMAT_WITH_UUID = JSON.stringify({
  device_id: 'd61f8a2c3b4e5f6071829a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f70810169',
  account_uuid: 'some-uuid-value',
  session_id: 'c72554f2-d198-4fd4-99c8-81e46410a1c5'
})

describe('metadataUserIdHelper', () => {
  describe('parse()', () => {
    it('should parse old format with empty accountUuid', () => {
      const result = parse(OLD_FORMAT)
      expect(result).toEqual({
        deviceId: 'd98385411c93cd074b2cefd5c9831fe77f24a53e4ecdcd1f830bba586fe62cb9',
        accountUuid: '',
        sessionId: '17cf0fd3-d51b-4b59-977d-b899dafb3022',
        isJsonFormat: false
      })
    })

    it('should parse old format with non-empty accountUuid', () => {
      const result = parse(OLD_FORMAT_WITH_UUID)
      expect(result).toEqual({
        deviceId: 'd98385411c93cd074b2cefd5c9831fe77f24a53e4ecdcd1f830bba586fe62cb9',
        accountUuid: 'abc-123',
        sessionId: '17cf0fd3-d51b-4b59-977d-b899dafb3022',
        isJsonFormat: false
      })
    })

    it('should parse JSON format', () => {
      const result = parse(JSON_FORMAT)
      expect(result).toEqual({
        deviceId: 'd61f8a2c3b4e5f6071829a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f70810169',
        accountUuid: '',
        sessionId: 'c72554f2-d198-4fd4-99c8-81e46410a1c5',
        isJsonFormat: true
      })
    })

    it('should parse JSON format with accountUuid', () => {
      const result = parse(JSON_FORMAT_WITH_UUID)
      expect(result).toEqual({
        deviceId: 'd61f8a2c3b4e5f6071829a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f70810169',
        accountUuid: 'some-uuid-value',
        sessionId: 'c72554f2-d198-4fd4-99c8-81e46410a1c5',
        isJsonFormat: true
      })
    })

    it('should tolerate extra fields in JSON format', () => {
      const extended = JSON.stringify({
        device_id: 'aabbccdd' + '0'.repeat(56),
        account_uuid: '',
        session_id: '11111111-2222-3333-4444-555555555555',
        some_future_field: 'value'
      })
      const result = parse(extended)
      expect(result).not.toBeNull()
      expect(result.sessionId).toBe('11111111-2222-3333-4444-555555555555')
      expect(result.isJsonFormat).toBe(true)
    })

    it('should return null for invalid JSON (missing device_id)', () => {
      const invalid = JSON.stringify({ account_uuid: '', session_id: 'abc' })
      expect(parse(invalid)).toBeNull()
    })

    it('should return null for invalid JSON (missing session_id)', () => {
      const invalid = JSON.stringify({ device_id: 'abc', account_uuid: '' })
      expect(parse(invalid)).toBeNull()
    })

    it('should return null for empty string', () => {
      expect(parse('')).toBeNull()
    })

    it('should return null for random string', () => {
      expect(parse('some-random-string')).toBeNull()
    })

    it('should return null for malformed JSON', () => {
      expect(parse('{garbage')).toBeNull()
    })

    it('should return null for null/undefined/number', () => {
      expect(parse(null)).toBeNull()
      expect(parse(undefined)).toBeNull()
      expect(parse(123)).toBeNull()
    })
  })

  describe('extractSessionId()', () => {
    it('should extract sessionId from old format', () => {
      expect(extractSessionId(OLD_FORMAT)).toBe('17cf0fd3-d51b-4b59-977d-b899dafb3022')
    })

    it('should extract sessionId from JSON format', () => {
      expect(extractSessionId(JSON_FORMAT)).toBe('c72554f2-d198-4fd4-99c8-81e46410a1c5')
    })

    it('should return null for invalid input', () => {
      expect(extractSessionId('invalid')).toBeNull()
      expect(extractSessionId(null)).toBeNull()
    })
  })

  describe('build()', () => {
    it('should build old format string', () => {
      const result = build({
        deviceId: 'd98385411c93cd074b2cefd5c9831fe77f24a53e4ecdcd1f830bba586fe62cb9',
        accountUuid: '',
        sessionId: '17cf0fd3-d51b-4b59-977d-b899dafb3022',
        isJsonFormat: false
      })
      expect(result).toBe(OLD_FORMAT)
    })

    it('should build old format with accountUuid', () => {
      const result = build({
        deviceId: 'd98385411c93cd074b2cefd5c9831fe77f24a53e4ecdcd1f830bba586fe62cb9',
        accountUuid: 'abc-123',
        sessionId: '17cf0fd3-d51b-4b59-977d-b899dafb3022',
        isJsonFormat: false
      })
      expect(result).toBe(OLD_FORMAT_WITH_UUID)
    })

    it('should build JSON format string', () => {
      const result = build({
        deviceId: 'd61f8a2c3b4e5f6071829a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f70810169',
        accountUuid: '',
        sessionId: 'c72554f2-d198-4fd4-99c8-81e46410a1c5',
        isJsonFormat: true
      })
      const parsed = JSON.parse(result)
      expect(parsed.device_id).toBe(
        'd61f8a2c3b4e5f6071829a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f70810169'
      )
      expect(parsed.account_uuid).toBe('')
      expect(parsed.session_id).toBe('c72554f2-d198-4fd4-99c8-81e46410a1c5')
    })
  })

  describe('roundtrip consistency', () => {
    it('old format parse → build should produce identical string', () => {
      const parsed = parse(OLD_FORMAT)
      expect(build(parsed)).toBe(OLD_FORMAT)
    })

    it('old format with uuid parse → build should produce identical string', () => {
      const parsed = parse(OLD_FORMAT_WITH_UUID)
      expect(build(parsed)).toBe(OLD_FORMAT_WITH_UUID)
    })

    it('JSON format parse → build should produce equivalent JSON', () => {
      const parsed = parse(JSON_FORMAT)
      const rebuilt = build(parsed)
      expect(JSON.parse(rebuilt)).toEqual(JSON.parse(JSON_FORMAT))
    })
  })

  describe('isValid()', () => {
    it('should return true for old format', () => {
      expect(isValid(OLD_FORMAT)).toBe(true)
    })

    it('should return true for JSON format', () => {
      expect(isValid(JSON_FORMAT)).toBe(true)
    })

    it('should return false for invalid inputs', () => {
      expect(isValid('')).toBe(false)
      expect(isValid('random-string')).toBe(false)
      expect(isValid('{garbage')).toBe(false)
      expect(isValid(null)).toBe(false)
      expect(isValid(undefined)).toBe(false)
      expect(isValid(42)).toBe(false)
    })
  })
})

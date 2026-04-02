/**
 * Identity Rewrite Service Tests
 * 移植自 cc-gateway 的测试用例
 */

// Mock logger，避免测试输出污染控制台
jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

// Mock Redis
jest.mock('../src/models/redis', () => ({
  getClient: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn()
  }))
}))

// Mock config
jest.mock('../config/config', () => ({
  identityRewrite: {
    defaults: {
      platform: 'darwin',
      shell: 'zsh',
      osVersion: 'Darwin 24.4.0',
      workingDir: '/Users/user/projects',
      version: '2.1.81',
      arch: 'arm64',
      nodeVersion: 'v24.3.0',
      terminal: 'iTerm2.app',
      constrainedMemory: 34359738368,
      rssRange: [300000000, 500000000],
      heapTotalRange: [40000000, 80000000],
      heapUsedRange: [100000000, 200000000]
    }
  }
}))

const identityRewriteService = require('../src/services/identityRewriteService')

describe('Identity Rewrite Service', () => {
  // Use getDefaultProfile() to get the actual profile with mocked config
  let defaultProfile

  beforeEach(() => {
    defaultProfile = identityRewriteService.getDefaultProfile()
  })

  describe('rewritePromptText', () => {
    it('should rewrite billing fingerprint in text', () => {
      const text = 'cc_version=2.1.81.abc x-anthropic-billing-header'
      const result = identityRewriteService.rewritePromptText(text, defaultProfile)

      expect(result).toContain('cc_version=2.1.81.000')
      expect(result).not.toContain('cc_version=2.1.81.abc')
    })

    it('should rewrite Platform in system prompt', () => {
      const text = 'Platform: linux'
      const result = identityRewriteService.rewritePromptText(text, defaultProfile)

      expect(result).toBe('Platform: darwin')
    })

    it('should rewrite Shell in system prompt', () => {
      const text = 'Shell: bash'
      const result = identityRewriteService.rewritePromptText(text, defaultProfile)

      expect(result).toBe('Shell: zsh')
    })

    it('should rewrite OS Version in system prompt', () => {
      const text = 'OS Version: Linux 6.5.0-xxx'
      const result = identityRewriteService.rewritePromptText(text, defaultProfile)

      expect(result).toBe('OS Version: Darwin 24.4.0')
    })

    it('should rewrite Working directory', () => {
      const text = 'Working directory: /home/alice/code'
      const result = identityRewriteService.rewritePromptText(text, defaultProfile)

      // Note: workingDir is used both for the Working directory line AND for home path replacement
      // So the result will have workingDir from the regex + potentially extra from home path rewrite
      expect(result).toContain('Working directory:')
      expect(result).toContain('/Users/user/projects')
    })

    it('should rewrite Primary Working directory', () => {
      const text = 'Primary working directory: /home/bob/project'
      const result = identityRewriteService.rewritePromptText(text, defaultProfile)

      expect(result).toContain('Primary working directory:')
      expect(result).toContain('/Users/user/projects')
    })
  })

  describe('rewriteHomePaths', () => {
    it('should replace /Users/xxx/ paths', () => {
      const text = '/Users/alice/Documents/file.txt'
      const result = identityRewriteService.rewriteHomePaths(text, '/Users/user/projects')

      expect(result).toBe('/Users/user/projects/Documents/file.txt')
    })

    it('should replace /home/xxx/ paths', () => {
      const text = '/home/bob/code/project'
      const result = identityRewriteService.rewriteHomePaths(text, '/Users/user/projects')

      expect(result).toBe('/Users/user/projects/code/project')
    })

    it('should handle multiple home paths', () => {
      const text = '/Users/alice/file1 and /home/bob/file2'
      const result = identityRewriteService.rewriteHomePaths(text, '/Users/user/')

      expect(result).toBe('/Users/user/file1 and /Users/user/file2')
    })

    it('should return non-string input unchanged', () => {
      expect(identityRewriteService.rewriteHomePaths(null, '/Users/user/')).toBeNull()
      expect(identityRewriteService.rewriteHomePaths(123, '/Users/user/')).toBe(123)
    })
  })

  describe('rewriteSystemPrompt', () => {
    it('should rewrite system array items', () => {
      const body = {
        system: [
          { type: 'text', text: 'Platform: linux Shell: bash' },
          { type: 'text', text: 'OS Version: Ubuntu 22.04' }
        ]
      }

      identityRewriteService.rewriteSystemPrompt(body, defaultProfile)

      expect(body.system[0].text).toBe('Platform: darwin Shell: zsh')
      expect(body.system[1].text).toBe('OS Version: Darwin 24.4.0')
    })

    it('should rewrite string system prompt', () => {
      const body = {
        system: 'Platform: linux'
      }

      identityRewriteService.rewriteSystemPrompt(body, defaultProfile)

      expect(body.system).toBe('Platform: darwin')
    })

    it('should NOT rewrite user message paths (needed for tool calls)', () => {
      const body = {
        system: [{ type: 'text', text: 'System prompt' }],
        messages: [
          { role: 'user', content: 'Check file at /Users/alice/doc.txt' },
          { role: 'user', content: [{ type: 'text', text: 'In /home/bob/project' }] }
        ]
      }

      identityRewriteService.rewriteSystemPrompt(body, defaultProfile)

      // Messages should remain unchanged — real file paths are needed for tool invocations
      expect(body.messages[0].content).toBe('Check file at /Users/alice/doc.txt')
      expect(body.messages[1].content[0].text).toBe('In /home/bob/project')
    })

    it('should handle non-object body gracefully', () => {
      expect(() => identityRewriteService.rewriteSystemPrompt(null, defaultProfile)).not.toThrow()
      expect(() =>
        identityRewriteService.rewriteSystemPrompt('string', defaultProfile)
      ).not.toThrow()
    })
  })

  describe('stripLeakFields', () => {
    it('should strip baseUrl, base_url, and gateway fields', () => {
      const body = {
        baseUrl: 'http://relay.example.com',
        base_url: 'http://relay.example.com',
        gateway: 'my-gateway',
        otherField: 'should remain'
      }

      identityRewriteService.stripLeakFields(body)

      expect(body.baseUrl).toBeUndefined()
      expect(body.base_url).toBeUndefined()
      expect(body.gateway).toBeUndefined()
      expect(body.otherField).toBe('should remain')
    })

    it('should handle non-object input gracefully', () => {
      expect(() => identityRewriteService.stripLeakFields(null)).not.toThrow()
      expect(() => identityRewriteService.stripLeakFields('string')).not.toThrow()
    })
  })

  describe('buildCanonicalEnv', () => {
    it('should build canonical environment object', () => {
      const env = identityRewriteService.buildCanonicalEnv(defaultProfile)

      expect(env.platform).toBe('darwin')
      expect(env.arch).toBe('arm64')
      expect(env.node_version).toBe('v24.3.0')
      expect(env.terminal).toBe('iTerm2.app')
      expect(env.is_ci).toBe(false)
      expect(env.is_claubbit).toBe(false)
      expect(env.is_claude_code_remote).toBe(false)
      expect(env.version).toBe('2.1.81')
    })

    it('should force CI-related flags to false', () => {
      const env = identityRewriteService.buildCanonicalEnv(defaultProfile)

      expect(env.is_ci).toBe(false)
      expect(env.is_github_action).toBe(false)
      expect(env.is_claude_code_action).toBe(false)
    })
  })

  describe('buildCanonicalProcess', () => {
    it('should normalize process metrics object', () => {
      const original = {
        constrainedMemory: 16000000000,
        rss: 800000000,
        heapTotal: 100000000,
        heapUsed: 250000000,
        uptime: 12345
      }

      const result = identityRewriteService.buildCanonicalProcess(original, defaultProfile)

      expect(result.constrainedMemory).toBe(34359738368) // canonical value
      expect(result.rss).toBeGreaterThanOrEqual(300000000)
      expect(result.rss).toBeLessThan(500000000)
      expect(result.heapTotal).toBeGreaterThanOrEqual(40000000)
      expect(result.heapTotal).toBeLessThan(80000000)
      expect(result.uptime).toBe(12345) // preserved
    })

    it('should handle base64 encoded process data', () => {
      const original = {
        constrainedMemory: 16000000000,
        rss: 800000000
      }
      const b64 = Buffer.from(JSON.stringify(original)).toString('base64')

      const result = identityRewriteService.buildCanonicalProcess(b64, defaultProfile)

      const decoded = JSON.parse(Buffer.from(result, 'base64').toString())
      expect(decoded.constrainedMemory).toBe(34359738368)
      expect(decoded.rss).toBeGreaterThanOrEqual(300000000)
    })

    it('should return invalid base64 unchanged', () => {
      const invalid = 'not-valid-base64!!!'
      const result = identityRewriteService.buildCanonicalProcess(invalid, defaultProfile)

      expect(result).toBe(invalid)
    })
  })

  describe('rewriteEventBatch', () => {
    it('should rewrite device_id and email per-account', () => {
      const body = {
        events: [
          {
            event_data: {
              device_id: 'original-device-id',
              email: 'original@example.com'
            }
          }
        ]
      }

      const result = identityRewriteService.rewriteEventBatch(body, defaultProfile, 'account-1')

      expect(result.events[0].event_data.device_id).not.toBe('original-device-id')
      expect(result.events[0].event_data.email).toContain('@example.com')
      expect(result.events[0].event_data.email).not.toBe('original@example.com')
    })

    it('should generate different device_id/email for different accounts', () => {
      const makeBody = () => ({
        events: [{ event_data: { device_id: 'orig', email: 'orig@test.com' } }]
      })

      const r1 = identityRewriteService.rewriteEventBatch(makeBody(), defaultProfile, 'account-1')
      const r2 = identityRewriteService.rewriteEventBatch(makeBody(), defaultProfile, 'account-2')

      expect(r1.events[0].event_data.device_id).not.toBe(r2.events[0].event_data.device_id)
      expect(r1.events[0].event_data.email).not.toBe(r2.events[0].event_data.email)
    })

    it('should replace env object entirely', () => {
      const body = {
        events: [
          {
            event_data: {
              env: { platform: 'windows', is_ci: true }
            }
          }
        ]
      }

      const result = identityRewriteService.rewriteEventBatch(body, defaultProfile)

      expect(result.events[0].event_data.env.platform).toBe('darwin')
      expect(result.events[0].event_data.env.is_ci).toBe(false)
    })

    it('should strip leak fields from events', () => {
      const body = {
        events: [
          {
            event_data: {
              baseUrl: 'http://relay.example.com',
              gateway: 'my-gateway',
              validField: 'should remain'
            }
          }
        ]
      }

      const result = identityRewriteService.rewriteEventBatch(body, defaultProfile)

      expect(result.events[0].event_data.baseUrl).toBeUndefined()
      expect(result.events[0].event_data.gateway).toBeUndefined()
      expect(result.events[0].event_data.validField).toBe('should remain')
    })

    it('should handle non-batch body gracefully', () => {
      const body = { notEvents: 'something' }
      const result = identityRewriteService.rewriteEventBatch(body, defaultProfile)

      expect(result).toEqual(body)
    })
  })

  describe('getPlatformDefaults', () => {
    it('should return Linux defaults for linux platform', () => {
      const defaults = identityRewriteService.getPlatformDefaults('linux')

      expect(defaults.shell).toBe('bash')
      expect(defaults.osVersion).toContain('Linux')
      expect(defaults.workingDir).toBe('/home/user/projects')
      expect(defaults.terminal).toBe('xterm-256color')
    })

    it('should return Windows defaults for win32 platform', () => {
      const defaults = identityRewriteService.getPlatformDefaults('win32')

      expect(defaults.shell).toBe('powershell')
      expect(defaults.osVersion).toContain('Windows')
      expect(defaults.workingDir).toContain('C:\\')
      expect(defaults.terminal).toBe('Windows Terminal')
    })

    it('should return Darwin defaults for darwin platform', () => {
      const defaults = identityRewriteService.getPlatformDefaults('darwin')

      expect(defaults.shell).toBe('zsh')
      expect(defaults.osVersion).toContain('Darwin')
      expect(defaults.workingDir).toBe('/Users/user/projects')
      expect(defaults.terminal).toBe('iTerm2.app')
    })
  })

  describe('rewriteGenericIdentity', () => {
    it('should rewrite device_id and email per-account', () => {
      const body = {
        device_id: 'real-device-id',
        email: 'realuser@company.com',
        other_field: 'should remain'
      }

      identityRewriteService.rewriteGenericIdentity(body, defaultProfile, 'account-1')

      expect(body.device_id).not.toBe('real-device-id')
      expect(body.device_id).toHaveLength(64) // sha256 hex
      expect(body.email).toContain('@example.com')
      expect(body.email).not.toBe('realuser@company.com')
      expect(body.other_field).toBe('should remain')
    })

    it('should generate different identities for different accounts', () => {
      const body1 = { device_id: 'orig', email: 'orig@test.com' }
      const body2 = { device_id: 'orig', email: 'orig@test.com' }

      identityRewriteService.rewriteGenericIdentity(body1, defaultProfile, 'account-1')
      identityRewriteService.rewriteGenericIdentity(body2, defaultProfile, 'account-2')

      expect(body1.device_id).not.toBe(body2.device_id)
      expect(body1.email).not.toBe(body2.email)
    })

    it('should skip fields that do not exist', () => {
      const body = { other_field: 'value' }

      identityRewriteService.rewriteGenericIdentity(body, defaultProfile)

      expect(body.device_id).toBeUndefined()
      expect(body.email).toBeUndefined()
      expect(body.other_field).toBe('value')
    })

    it('should handle non-object input gracefully', () => {
      expect(() =>
        identityRewriteService.rewriteGenericIdentity(null, defaultProfile)
      ).not.toThrow()
      expect(() =>
        identityRewriteService.rewriteGenericIdentity('string', defaultProfile)
      ).not.toThrow()
    })
  })

  describe('generateDeviceId', () => {
    it('should generate deterministic device ID for same profile and account', () => {
      const id1 = identityRewriteService.generateDeviceId(defaultProfile, 'account-1')
      const id2 = identityRewriteService.generateDeviceId(defaultProfile, 'account-1')

      expect(id1).toBe(id2)
      expect(id1).toHaveLength(64) // sha256 hex
    })

    it('should generate different IDs for different accounts with same profile', () => {
      const id1 = identityRewriteService.generateDeviceId(defaultProfile, 'account-1')
      const id2 = identityRewriteService.generateDeviceId(defaultProfile, 'account-2')

      expect(id1).not.toBe(id2)
    })

    it('should generate different IDs for different profiles', () => {
      const profile1 = { ...defaultProfile, platform: 'darwin' }
      const profile2 = { ...defaultProfile, platform: 'linux' }

      const id1 = identityRewriteService.generateDeviceId(profile1, 'account-1')
      const id2 = identityRewriteService.generateDeviceId(profile2, 'account-1')

      expect(id1).not.toBe(id2)
    })
  })

  describe('generateEmail', () => {
    it('should generate deterministic email for same account', () => {
      const e1 = identityRewriteService.generateEmail('account-1')
      const e2 = identityRewriteService.generateEmail('account-1')

      expect(e1).toBe(e2)
      expect(e1).toContain('@example.com')
    })

    it('should generate different emails for different accounts', () => {
      const e1 = identityRewriteService.generateEmail('account-1')
      const e2 = identityRewriteService.generateEmail('account-2')

      expect(e1).not.toBe(e2)
    })

    it('should return default email when no accountId', () => {
      expect(identityRewriteService.generateEmail(null)).toBe('user@example.com')
      expect(identityRewriteService.generateEmail(undefined)).toBe('user@example.com')
    })
  })
})

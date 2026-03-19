/**
 * 集成级等价性测试
 *
 * 内嵌旧代码逻辑的精确副本，与新代码做 A/B 对比，
 * 证明对旧格式输入，新代码的行为与旧代码完全一致。
 * 同时验证新 JSON 格式在旧代码下的失败表现。
 */

const crypto = require('crypto')
const { parse, extractSessionId, build, isValid } = require('../src/utils/metadataUserIdHelper')

// ─── 复制 requestIdentityService 中的 formatUuidFromSeed（保持不变） ───
function formatUuidFromSeed(seed) {
  const digest = crypto.createHash('sha256').update(String(seed)).digest()
  const bytes = Buffer.from(digest.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function normalizeAccountUuid(candidate) {
  if (typeof candidate !== 'string') return null
  const trimmed = candidate.trim()
  return trimmed || null
}

// ─── 旧版 rewriteUserId 精确副本 ───
const SESSION_PREFIX = 'session_'
const ACCOUNT_MARKER = '_account_'

function oldRewriteUserId(body, accountId, accountUuid) {
  if (!body || typeof body !== 'object') return { nextBody: body, changed: false }
  const { metadata } = body
  if (!metadata || typeof metadata !== 'object') return { nextBody: body, changed: false }
  const userId = metadata.user_id
  if (typeof userId !== 'string') return { nextBody: body, changed: false }

  const pivot = userId.lastIndexOf(SESSION_PREFIX)
  if (pivot === -1) return { nextBody: body, changed: false }

  const prefixBeforeSession = userId.slice(0, pivot)
  const sessionTail = userId.slice(pivot + SESSION_PREFIX.length)
  const seedTail = sessionTail || 'default'
  const effectiveScheduler = accountId ? String(accountId) : 'unknown-scheduler'
  const hashed = formatUuidFromSeed(`${effectiveScheduler}::${seedTail}`)

  let normalizedPrefix = prefixBeforeSession
  if (accountUuid) {
    const trimmedUuid = normalizeAccountUuid(accountUuid)
    if (trimmedUuid) {
      const accountIndex = normalizedPrefix.indexOf(ACCOUNT_MARKER)
      if (accountIndex === -1) {
        const base = normalizedPrefix.replace(/_+$/, '')
        const baseWithMarker = /_account$/.test(base) ? base : `${base}_account`
        normalizedPrefix = `${baseWithMarker}_${trimmedUuid}_`
      } else {
        const valueStart = accountIndex + ACCOUNT_MARKER.length
        let separatorIndex = normalizedPrefix.indexOf('_', valueStart)
        if (separatorIndex === -1) separatorIndex = normalizedPrefix.length
        const head = normalizedPrefix.slice(0, valueStart)
        let tail = '_'
        if (separatorIndex < normalizedPrefix.length) {
          tail = normalizedPrefix.slice(separatorIndex)
          if (/^_+$/.test(tail)) tail = '_'
        }
        normalizedPrefix = `${head}${trimmedUuid}${tail}`
      }
    }
  }

  const nextUserId = `${normalizedPrefix}${SESSION_PREFIX}${hashed}`
  if (nextUserId === userId) return { nextBody: body, changed: false }
  return {
    nextBody: { ...body, metadata: { ...metadata, user_id: nextUserId } },
    changed: true
  }
}

// ─── 新版 rewriteUserId（从 requestIdentityService 中提取的逻辑） ───
function newRewriteUserId(body, accountId, accountUuid) {
  if (!body || typeof body !== 'object') return { nextBody: body, changed: false }
  const { metadata } = body
  if (!metadata || typeof metadata !== 'object') return { nextBody: body, changed: false }
  const userId = metadata.user_id
  if (typeof userId !== 'string') return { nextBody: body, changed: false }

  const parsed = parse(userId)
  if (!parsed) return { nextBody: body, changed: false }

  const seedTail = parsed.sessionId || 'default'
  const effectiveScheduler = accountId ? String(accountId) : 'unknown-scheduler'
  const hashedSession = formatUuidFromSeed(`${effectiveScheduler}::${seedTail}`)
  const effectiveUuid = normalizeAccountUuid(accountUuid) || parsed.accountUuid || ''

  const nextUserId = build({
    deviceId: parsed.deviceId,
    accountUuid: effectiveUuid,
    sessionId: hashedSession,
    isJsonFormat: parsed.isJsonFormat
  })

  if (nextUserId === userId) return { nextBody: body, changed: false }
  return {
    nextBody: { ...body, metadata: { ...metadata, user_id: nextUserId } },
    changed: true
  }
}

// ─── 旧版 _replaceClientId 精确副本 ───
function oldReplaceClientId(body, unifiedClientId) {
  if (!body || !body.metadata || !body.metadata.user_id || !unifiedClientId) return
  const userId = body.metadata.user_id
  const match = userId.match(/^user_[a-f0-9]{64}(_account__session_[a-f0-9-]{36})$/)
  if (match && match[1]) {
    body.metadata.user_id = `user_${unifiedClientId}${match[1]}`
  }
}

// ─── 新版 _replaceClientId ───
function newReplaceClientId(body, unifiedClientId) {
  if (!body?.metadata?.user_id || !unifiedClientId) return
  const parsed = parse(body.metadata.user_id)
  if (!parsed) return
  body.metadata.user_id = build({ ...parsed, deviceId: unifiedClientId })
}

// ─── 旧版 sessionHelper extractSessionId ───
function oldExtractSessionFromMetadata(userId) {
  const sessionMatch = userId.match(/session_([a-f0-9-]{36})/)
  return sessionMatch && sessionMatch[1] ? sessionMatch[1] : null
}

// ─── 旧版 claudeRelayConfigService extractOriginalSessionId ───
function oldExtractOriginalSessionId(userId) {
  const match = userId.match(/session_([a-f0-9-]{36})$/i)
  return match ? match[1] : null
}

// ─── 旧版 claudeCodeValidator 的 user_id 校验 ───
function oldIsValidUserId(userId) {
  const userIdPattern = /^user_[a-fA-F0-9]{64}_account__session_[\w-]+$/
  return userIdPattern.test(userId)
}

// ─── 测试数据 ───
const DEVICE_HASH = 'd98385411c93cd074b2cefd5c9831fe77f24a53e4ecdcd1f830bba586fe62cb9'
const SESSION_UUID = '17cf0fd3-d51b-4b59-977d-b899dafb3022'
const OLD_USERID = `user_${DEVICE_HASH}_account__session_${SESSION_UUID}`
const OLD_USERID_WITH_UUID = `user_${DEVICE_HASH}_account_real-uuid-123_session_${SESSION_UUID}`

const JSON_DEVICE = 'd61f8a2c3b4e5f6071829a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f70810169'
const JSON_SESSION = 'c72554f2-d198-4fd4-99c8-81e46410a1c5'
const JSON_USERID = JSON.stringify({
  device_id: JSON_DEVICE,
  account_uuid: '',
  session_id: JSON_SESSION
})

// ========================================================
// 测试
// ========================================================

describe('旧格式等价性验证', () => {
  // ---- rewriteUserId ----
  describe('rewriteUserId: 旧格式 → 新旧代码产出完全一致', () => {
    const cases = [
      ['空 accountUuid, 有 accountId', 'acct-1', undefined],
      ['空 accountUuid, 无 accountId', undefined, undefined],
      ['提供 accountUuid', 'acct-1', 'real-uuid-123'],
      ['accountUuid 为空白字符串', 'acct-1', '   '],
      ['accountUuid 带空格', 'acct-1', '  real-uuid  '],
      ['accountUuid 为 null', 'acct-1', null],
      ['accountUuid 为空字符串', 'acct-1', '']
    ]

    test.each(cases)('%s', (_label, accountId, accountUuid) => {
      const bodyOld = { metadata: { user_id: OLD_USERID }, model: 'claude-3' }
      const bodyNew = { metadata: { user_id: OLD_USERID }, model: 'claude-3' }

      const oldResult = oldRewriteUserId(bodyOld, accountId, accountUuid)
      const newResult = newRewriteUserId(bodyNew, accountId, accountUuid)

      expect(newResult.nextBody.metadata.user_id).toBe(oldResult.nextBody.metadata.user_id)
      expect(newResult.changed).toBe(oldResult.changed)
    })

    it('旧格式已有 accountUuid 时覆盖新 uuid', () => {
      const bodyOld = { metadata: { user_id: OLD_USERID_WITH_UUID }, model: 'claude-3' }
      const bodyNew = { metadata: { user_id: OLD_USERID_WITH_UUID }, model: 'claude-3' }

      const oldResult = oldRewriteUserId(bodyOld, 'acct-2', 'new-uuid-456')
      const newResult = newRewriteUserId(bodyNew, 'acct-2', 'new-uuid-456')

      expect(newResult.nextBody.metadata.user_id).toBe(oldResult.nextBody.metadata.user_id)
    })
  })

  // ---- _replaceClientId ----
  describe('_replaceClientId: 旧格式 → 新旧代码产出完全一致', () => {
    it('标准替换', () => {
      const unified = 'a'.repeat(64)
      const bodyOld = { metadata: { user_id: OLD_USERID } }
      const bodyNew = { metadata: { user_id: OLD_USERID } }

      oldReplaceClientId(bodyOld, unified)
      newReplaceClientId(bodyNew, unified)

      expect(bodyNew.metadata.user_id).toBe(bodyOld.metadata.user_id)
    })
  })

  // ---- extractSessionId ----
  describe('extractSessionId: 旧格式 → 新旧代码产出完全一致', () => {
    it('sessionHelper 路径', () => {
      expect(extractSessionId(OLD_USERID)).toBe(oldExtractSessionFromMetadata(OLD_USERID))
    })

    it('claudeRelayConfigService 路径', () => {
      expect(extractSessionId(OLD_USERID)).toBe(oldExtractOriginalSessionId(OLD_USERID))
    })

    it('带 accountUuid 的旧格式', () => {
      expect(extractSessionId(OLD_USERID_WITH_UUID)).toBe(SESSION_UUID)
      // 旧代码也能匹配（非锚定正则）
      expect(oldExtractSessionFromMetadata(OLD_USERID_WITH_UUID)).toBe(SESSION_UUID)
    })
  })

  // ---- claudeCodeValidator ----
  describe('claudeCodeValidator isValid: 旧格式 → 新代码不弱于旧代码', () => {
    it('标准旧格式两者都通过', () => {
      expect(oldIsValidUserId(OLD_USERID)).toBe(true)
      expect(isValid(OLD_USERID)).toBe(true)
    })
  })
})

describe('JSON 格式正确性验证', () => {
  describe('旧代码在 JSON 格式下全部失败（验证 bug 存在）', () => {
    it('旧 validator 拒绝 JSON', () => {
      expect(oldIsValidUserId(JSON_USERID)).toBe(false)
    })

    it('旧 sessionHelper 提取失败', () => {
      // 旧正则 /session_([a-f0-9-]{36})/ 在 JSON 中匹配 "session_id" 但 capture 不到
      // 因为 'i' 不在 [a-f0-9-] 中
      expect(oldExtractSessionFromMetadata(JSON_USERID)).toBeNull()
    })

    it('旧 extractOriginalSessionId 提取失败', () => {
      expect(oldExtractOriginalSessionId(JSON_USERID)).toBeNull()
    })

    it('旧 rewriteUserId 产出垃圾数据', () => {
      const body = { metadata: { user_id: JSON_USERID } }
      const result = oldRewriteUserId(body, 'acct-1', null)
      // 旧代码 lastIndexOf('session_') 匹配到 JSON key "session_id" 中的 session_
      // 切割后产出损坏的字符串
      if (result.changed) {
        expect(result.nextBody.metadata.user_id).not.toContain('"session_id"')
      }
    })

    it('旧 _replaceClientId 静默不生效', () => {
      const body = { metadata: { user_id: JSON_USERID } }
      const original = body.metadata.user_id
      oldReplaceClientId(body, 'a'.repeat(64))
      expect(body.metadata.user_id).toBe(original) // 未变化
    })
  })

  describe('新代码在 JSON 格式下全部正确', () => {
    it('新 validator 接受 JSON', () => {
      expect(isValid(JSON_USERID)).toBe(true)
    })

    it('新 extractSessionId 正确提取', () => {
      expect(extractSessionId(JSON_USERID)).toBe(JSON_SESSION)
    })

    it('新 rewriteUserId 保留 JSON 格式并正确改写', () => {
      const body = { metadata: { user_id: JSON_USERID }, model: 'claude-3' }
      const result = newRewriteUserId(body, 'acct-1', 'real-uuid')

      expect(result.changed).toBe(true)
      // 输出仍为合法 JSON
      const output = JSON.parse(result.nextBody.metadata.user_id)
      expect(output.device_id).toBe(JSON_DEVICE) // deviceId 不变
      expect(output.account_uuid).toBe('real-uuid') // 注入了真实 uuid
      expect(output.session_id).not.toBe(JSON_SESSION) // session 被哈希
      // 哈希后是合法 UUID 格式
      expect(output.session_id).toMatch(
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
      )
    })

    it('新 rewriteUserId JSON 格式无 accountUuid 时保留空', () => {
      const body = { metadata: { user_id: JSON_USERID }, model: 'claude-3' }
      const result = newRewriteUserId(body, 'acct-1', null)

      expect(result.changed).toBe(true)
      const output = JSON.parse(result.nextBody.metadata.user_id)
      expect(output.account_uuid).toBe('')
    })

    it('新 _replaceClientId 正确替换 deviceId 并保留 JSON 格式', () => {
      const newDeviceId = 'b'.repeat(64)
      const body = { metadata: { user_id: JSON_USERID } }
      newReplaceClientId(body, newDeviceId)

      const output = JSON.parse(body.metadata.user_id)
      expect(output.device_id).toBe(newDeviceId)
      expect(output.account_uuid).toBe('')
      expect(output.session_id).toBe(JSON_SESSION) // session 不变
    })
  })
})

describe('rewriteUserId 哈希 seed 一致性', () => {
  it('旧格式：新旧代码使用完全相同的 seed 做哈希', () => {
    // 旧代码 seed: `${effectiveScheduler}::${sessionTail}`
    //   sessionTail = userId.slice(pivot + 'session_'.length)
    //              = SESSION_UUID
    // 新代码 seed: `${effectiveScheduler}::${parsed.sessionId}`
    //   parsed.sessionId = SESSION_UUID (regex capture)
    // 两者 seed 完全相同
    const body1 = { metadata: { user_id: OLD_USERID } }
    const body2 = { metadata: { user_id: OLD_USERID } }
    const old = oldRewriteUserId(body1, 'acct-1', null)
    const neo = newRewriteUserId(body2, 'acct-1', null)
    expect(neo.nextBody.metadata.user_id).toBe(old.nextBody.metadata.user_id)
  })

  it('JSON 格式：seed 是正确的 sessionId 而非旧代码的垃圾截断', () => {
    const body = { metadata: { user_id: JSON_USERID } }
    const result = newRewriteUserId(body, 'acct-1', null)
    const expected = formatUuidFromSeed(`acct-1::${JSON_SESSION}`)
    const output = JSON.parse(result.nextBody.metadata.user_id)
    expect(output.session_id).toBe(expected)
  })
})

describe('边界条件', () => {
  it('非字符串 user_id → 新旧代码都不处理', () => {
    const body = { metadata: { user_id: 12345 } }
    const result = newRewriteUserId(body, 'acct-1', null)
    expect(result.changed).toBe(false)
  })

  it('无 metadata → 新旧代码都不处理', () => {
    const result = newRewriteUserId({ model: 'claude-3' }, 'acct-1', null)
    expect(result.changed).toBe(false)
  })

  it('无法解析的字符串 → 新代码不处理', () => {
    const body = { metadata: { user_id: 'random-garbage' } }
    const result = newRewriteUserId(body, 'acct-1', null)
    expect(result.changed).toBe(false)
  })

  it('空 body → 新代码不处理', () => {
    const result = newRewriteUserId(null, 'acct-1', null)
    expect(result.changed).toBe(false)
  })

  it('_replaceClientId 无 unifiedClientId → 不处理', () => {
    const body = { metadata: { user_id: OLD_USERID } }
    const original = body.metadata.user_id
    newReplaceClientId(body, null)
    expect(body.metadata.user_id).toBe(original)
  })

  it('_replaceClientId 无 user_id → 不处理', () => {
    const body = { metadata: {} }
    newReplaceClientId(body, 'abc')
    expect(body.metadata.user_id).toBeUndefined()
  })
})

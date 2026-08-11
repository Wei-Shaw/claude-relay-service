/**
 * Account Migration Service
 * 编排层：读账户(解密) -> 规范化快照；导出/预检/导入。
 *
 * 职责边界：
 *   - 这里承担「各平台解密不一致」的脏活（claude 原样加密、openai 不解 accessToken、droid 掩码 apiKeys…）。
 *   - 格式转换委托给 mappers；格式识别/解析委托给 parsers。
 *   - 不破坏现有 /admin/sync/export-accounts 契约（本服务全部走新路径）。
 */

const AdmZip = require('adm-zip')
const logger = require('../utils/logger')
const redis = require('../models/redis')
const { RedisKeys } = require('../constants/redisKeys')

const claudeAccountService = require('./account/claudeAccountService')
const claudeConsoleAccountService = require('./account/claudeConsoleAccountService')
const ccrAccountService = require('./account/ccrAccountService')
const openaiAccountService = require('./account/openaiAccountService')
const openaiResponsesAccountService = require('./account/openaiResponsesAccountService')
const geminiAccountService = require('./account/geminiAccountService')
const geminiApiAccountService = require('./account/geminiApiAccountService')
const azureOpenaiAccountService = require('./account/azureOpenaiAccountService')
const bedrockAccountService = require('./account/bedrockAccountService')
const droidAccountService = require('./account/droidAccountService')
const grokAccountService = require('./account/grokAccountService')

const mappers = require('./accountMigrationMappers')
const parsers = require('./accountMigrationParsers')

const { CRS_PLATFORM } = mappers
const CRS_EXPORT_TYPE = parsers.CRS_TYPE
const CRS_EXPORT_VERSION = 1

// 安全 JSON.parse
function sj(raw, fallback = null) {
  if (raw === undefined || raw === null) {
    return fallback
  }
  if (typeof raw !== 'string') {
    return raw
  }
  try {
    return JSON.parse(raw)
  } catch (_) {
    return fallback
  }
}

// ===================== 导出端：读账户 -> 规范化快照 =====================
// 各平台解密行为不一致，这里收口。snapshot.data 字段对齐对应 createAccount 入参。

// Claude：getClaudeAccount 返回原始加密 hash，需显式解密（参考 sync.js 逻辑）
async function readClaudeSnapshot(id) {
  const a = await redis.getClaudeAccount(id)
  if (!a || Object.keys(a).length === 0) {
    return null
  }
  const dec = (v) => (v ? claudeAccountService._decryptSensitiveData(v) : '')
  const oauth = sj(dec(a.claudeAiOauth), null)
  const accessToken = dec(a.accessToken) || oauth?.accessToken || ''
  const refreshToken = dec(a.refreshToken) || oauth?.refreshToken || ''
  const scopes = a.scopes ? a.scopes.trim().split(' ').filter(Boolean) : oauth?.scopes || []
  const expiresAt = a.expiresAt ? Number(a.expiresAt) : oauth?.expiresAt || 0
  return {
    platform: CRS_PLATFORM.CLAUDE,
    id,
    name: a.name || '',
    description: a.description || '',
    data: {
      name: a.name,
      description: a.description || '',
      email: dec(a.email),
      claudeAiOauth: pruneObj({ accessToken, refreshToken, expiresAt, scopes }),
      proxy: sj(a.proxy, null),
      priority: toInt(a.priority, 50),
      accountType: a.accountType || 'shared',
      schedulable: a.schedulable !== 'false',
      subscriptionInfo: sj(a.subscriptionInfo, null),
      subscriptionExpiresAt: a.subscriptionExpiresAt || null
    }
  }
}

function pruneObj(o) {
  const out = {}
  for (const [k, v] of Object.entries(o || {})) {
    if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)) {
      out[k] = v
    }
  }
  return out
}

function toInt(v, dflt) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : dflt
}

// OpenAI OAuth：getAccount 解了 refreshToken/email/openaiOauth，但故意没解 accessToken
async function readOpenAiSnapshot(id) {
  const a = await openaiAccountService.getAccount(id)
  if (!a) {
    return null
  }
  let accessToken = a.openaiOauth?.accessToken || ''
  if (a.accessToken) {
    try {
      accessToken = openaiAccountService.decrypt(a.accessToken)
    } catch (_) {
      // ignore; fall back to oauth blob
    }
  }
  return {
    platform: CRS_PLATFORM.OPENAI,
    id,
    name: a.name || '',
    description: a.description || '',
    data: {
      name: a.name,
      description: a.description || '',
      openaiOauth: pruneObj({
        accessToken,
        refreshToken: a.refreshToken,
        idToken: a.idToken,
        scope: a.scopes
      }),
      accountInfo: pruneObj({
        accountId: a.accountId,
        chatgptUserId: a.chatgptUserId,
        organizationId: a.organizationId,
        email: a.email,
        planType: a.planType
      }),
      accessToken,
      refreshToken: a.refreshToken,
      idToken: a.idToken,
      expiresAt: a.expiresAt,
      proxy: a.proxy || null,
      priority: toInt(a.priority, 50),
      accountType: a.accountType || 'shared',
      schedulable: a.schedulable !== 'false' && a.schedulable !== false,
      subscriptionExpiresAt: a.subscriptionExpiresAt || null
    }
  }
}

// Gemini OAuth：getAccount 已解密 geminiOauth/accessToken/refreshToken
async function readGeminiSnapshot(id) {
  const a = await geminiAccountService.getAccount(id)
  if (!a) {
    return null
  }
  return {
    platform: CRS_PLATFORM.GEMINI,
    id,
    name: a.name || '',
    description: a.description || '',
    data: {
      name: a.name,
      description: a.description || '',
      geminiOauth: sj(a.geminiOauth, a.geminiOauth) || undefined,
      accessToken: a.accessToken || undefined,
      refreshToken: a.refreshToken || undefined,
      scopes: a.scopes || undefined,
      oauthProvider: a.oauthProvider || 'gemini-cli',
      projectId: a.projectId || undefined,
      proxy: a.proxy || null,
      priority: toInt(a.priority, 50),
      accountType: a.accountType || 'shared',
      schedulable: a.schedulable !== false,
      subscriptionExpiresAt: a.subscriptionExpiresAt || null,
      supportedModels: a.supportedModels || []
    }
  }
}

// Gemini API：getAccount 已解密 apiKey
async function readGeminiApiSnapshot(id) {
  const a = await geminiApiAccountService.getAccount(id)
  if (!a) {
    return null
  }
  return apiKeySnapshot(CRS_PLATFORM.GEMINI_API, id, a, {
    apiKey: a.apiKey,
    baseUrl: a.baseUrl,
    supportedModels: a.supportedModels || []
  })
}

// Claude Console：getAccount 已解密 apiKey
async function readClaudeConsoleSnapshot(id) {
  const a = await claudeConsoleAccountService.getAccount(id)
  if (!a) {
    return null
  }
  return apiKeySnapshot(CRS_PLATFORM.CLAUDE_CONSOLE, id, a, {
    apiUrl: a.apiUrl,
    apiKey: a.apiKey,
    supportedModels: a.supportedModels || [],
    userAgent: a.userAgent,
    rateLimitDuration: a.rateLimitDuration,
    maxConcurrentTasks: a.maxConcurrentTasks
  })
}

// CCR：getAccount 已解密 apiKey
async function readCcrSnapshot(id) {
  const a = await ccrAccountService.getAccount(id)
  if (!a) {
    return null
  }
  return apiKeySnapshot(CRS_PLATFORM.CCR, id, a, {
    apiUrl: a.apiUrl,
    apiKey: a.apiKey,
    supportedModels: a.supportedModels || [],
    userAgent: a.userAgent,
    rateLimitDuration: a.rateLimitDuration
  })
}

// OpenAI Responses：getAccount 已解密 apiKey
async function readOpenAiResponsesSnapshot(id) {
  const a = await openaiResponsesAccountService.getAccount(id)
  if (!a) {
    return null
  }
  return apiKeySnapshot(CRS_PLATFORM.OPENAI_RESPONSES, id, a, {
    baseApi: a.baseApi,
    apiKey: a.apiKey,
    userAgent: a.userAgent,
    rateLimitDuration: a.rateLimitDuration,
    providerEndpoint: a.providerEndpoint
  })
}

// Azure OpenAI：getAccount 已解密 apiKey
async function readAzureSnapshot(id) {
  const a = await azureOpenaiAccountService.getAccount(id)
  if (!a) {
    return null
  }
  return apiKeySnapshot(CRS_PLATFORM.AZURE_OPENAI, id, a, {
    azureEndpoint: a.azureEndpoint,
    apiVersion: a.apiVersion,
    deploymentName: a.deploymentName,
    apiKey: a.apiKey,
    supportedModels: a.supportedModels || []
  })
}

// 通用 API-Key 类快照构造
function apiKeySnapshot(platform, id, a, extraData) {
  return {
    platform,
    id,
    name: a.name || '',
    description: a.description || '',
    data: {
      name: a.name,
      description: a.description || '',
      ...extraData,
      proxy: a.proxy || null,
      priority: toInt(a.priority, 50),
      accountType: a.accountType || 'shared',
      schedulable: a.schedulable !== false && a.schedulable !== 'false',
      subscriptionExpiresAt: a.subscriptionExpiresAt || null
    }
  }
}

// Droid：getAccount 解密 token 但掩码 apiKeys；用 getDecryptedApiKeyEntries 取明文 key
async function readDroidSnapshot(id) {
  const a = await droidAccountService.getAccount(id)
  if (!a) {
    return null
  }
  let apiKeys = []
  try {
    const entries = await droidAccountService.getDecryptedApiKeyEntries(id)
    apiKeys = entries.map((e) => e.key).filter(Boolean)
  } catch (_) {
    apiKeys = []
  }
  return {
    platform: CRS_PLATFORM.DROID,
    id,
    name: a.name || '',
    description: a.description || '',
    data: {
      name: a.name,
      description: a.description || '',
      refreshToken: a.refreshToken || '',
      accessToken: a.accessToken || '',
      expiresAt: a.expiresAt || '',
      endpointType: a.endpointType || 'anthropic',
      organizationId: a.organizationId || '',
      ownerEmail: a.ownerEmail || '',
      ownerName: a.ownerName || '',
      userId: a.userId || '',
      tokenType: a.tokenType || 'Bearer',
      authenticationMethod: a.authenticationMethod || '',
      apiKeys,
      userAgent: a.userAgent || '',
      proxy: a.proxy || null,
      priority: toInt(a.priority, 50),
      accountType: a.accountType || 'shared',
      schedulable: a.schedulable !== false && a.schedulable !== 'false'
    }
  }
}

// Grok：getAccount 默认解密敏感字段
async function readGrokSnapshot(id) {
  const a = await grokAccountService.getAccount(id, { decryptSecrets: true })
  if (!a) {
    return null
  }
  return {
    platform: CRS_PLATFORM.GROK,
    id,
    name: a.name || '',
    description: a.description || '',
    data: {
      name: a.name,
      description: a.description || '',
      authType: a.authType || 'oauth',
      accessToken: a.accessToken || '',
      refreshToken: a.refreshToken || '',
      idToken: a.idToken || '',
      apiKey: a.apiKey || '',
      expiresAt: a.expiresAt || '',
      email: a.email || '',
      clientId: a.clientId || '',
      baseUrl: a.baseUrl || '',
      mediaBaseUrl: a.mediaBaseUrl || '',
      planType: a.planType || '',
      subscriptionTier: a.subscriptionTier || '',
      proxy: a.proxy || null,
      priority: toInt(a.priority, 50),
      accountType: a.accountType || 'shared',
      schedulable: a.schedulable !== false && a.schedulable !== 'false',
      disableAutoProtection: a.disableAutoProtection === true || a.disableAutoProtection === 'true'
    }
  }
}

// Bedrock：getAccount 返回 { success, data }，data 内 awsCredentials/bearerToken 已解密
async function readBedrockSnapshot(id) {
  const res = await bedrockAccountService.getAccount(id)
  if (!res || !res.success || !res.data) {
    return null
  }
  const a = res.data
  return {
    platform: CRS_PLATFORM.BEDROCK,
    id,
    name: a.name || '',
    description: a.description || '',
    data: {
      name: a.name,
      description: a.description || '',
      region: a.region,
      defaultModel: a.defaultModel,
      credentialType: a.credentialType || 'access_key',
      awsCredentials: a.awsCredentials || null,
      bearerToken: a.bearerToken || null,
      proxy: a.proxy || null,
      priority: toInt(a.priority, 50),
      accountType: a.accountType || 'shared',
      schedulable: a.schedulable !== false && a.schedulable !== 'false',
      subscriptionExpiresAt: a.subscriptionExpiresAt || null
    }
  }
}

// ===================== 注册表：平台 -> reader / 枚举 / 创建 / 更新 =====================
const PLATFORM_READERS = {
  [CRS_PLATFORM.CLAUDE]: readClaudeSnapshot,
  [CRS_PLATFORM.CLAUDE_CONSOLE]: readClaudeConsoleSnapshot,
  [CRS_PLATFORM.CCR]: readCcrSnapshot,
  [CRS_PLATFORM.OPENAI]: readOpenAiSnapshot,
  [CRS_PLATFORM.OPENAI_RESPONSES]: readOpenAiResponsesSnapshot,
  [CRS_PLATFORM.GEMINI]: readGeminiSnapshot,
  [CRS_PLATFORM.GEMINI_API]: readGeminiApiSnapshot,
  [CRS_PLATFORM.AZURE_OPENAI]: readAzureSnapshot,
  [CRS_PLATFORM.BEDROCK]: readBedrockSnapshot,
  [CRS_PLATFORM.DROID]: readDroidSnapshot,
  [CRS_PLATFORM.GROK]: readGrokSnapshot
}

// 各平台 ID 枚举（index + scan 回退 + 提取正则）
const PLATFORM_INDEX = {
  [CRS_PLATFORM.CLAUDE]: {
    index: RedisKeys.accounts.claudeIndex,
    pattern: RedisKeys.accounts.claudePattern,
    re: /^claude:account:(.+)$/
  },
  [CRS_PLATFORM.CLAUDE_CONSOLE]: {
    index: RedisKeys.accounts.claudeConsoleIndex,
    pattern: RedisKeys.accounts.claudeConsolePattern,
    re: /^claude_console_account:(.+)$/
  },
  [CRS_PLATFORM.CCR]: {
    index: RedisKeys.accounts.ccrIndex,
    pattern: RedisKeys.accounts.ccrPattern,
    re: /^ccr_account:(.+)$/
  },
  [CRS_PLATFORM.OPENAI]: {
    index: RedisKeys.accounts.openaiIndex,
    pattern: RedisKeys.accounts.openaiPattern,
    re: /^openai:account:(.+)$/
  },
  [CRS_PLATFORM.OPENAI_RESPONSES]: {
    index: RedisKeys.accounts.openaiResponsesIndex,
    pattern: RedisKeys.accounts.openaiResponsesPattern,
    re: /^openai_responses_account:(.+)$/
  },
  [CRS_PLATFORM.GEMINI]: {
    index: RedisKeys.accounts.geminiIndex,
    pattern: RedisKeys.accounts.geminiPattern,
    re: /^gemini_account:(.+)$/
  },
  [CRS_PLATFORM.GEMINI_API]: {
    index: RedisKeys.accounts.geminiApiIndex,
    pattern: RedisKeys.accounts.geminiApiPattern,
    re: /^gemini_api_account:(.+)$/
  },
  [CRS_PLATFORM.AZURE_OPENAI]: {
    index: RedisKeys.accounts.azureOpenaiIndex,
    pattern: RedisKeys.accounts.azureOpenaiPattern,
    re: /^azure_openai:account:(.+)$/
  },
  [CRS_PLATFORM.BEDROCK]: {
    index: RedisKeys.accounts.bedrockIndex,
    pattern: RedisKeys.accounts.bedrockPattern,
    re: /^bedrock_account:(.+)$/
  },
  [CRS_PLATFORM.DROID]: {
    index: RedisKeys.accounts.droidIndex,
    pattern: RedisKeys.accounts.droidPattern,
    re: /^droid:account:(.+)$/
  },
  [CRS_PLATFORM.GROK]: {
    index: RedisKeys.accounts.grokIndex,
    pattern: RedisKeys.accounts.grokPattern,
    re: /^grok:account:(.+)$/
  }
}

const ALL_PLATFORMS = Object.keys(PLATFORM_READERS)

async function listIds(platform) {
  const cfg = PLATFORM_INDEX[platform]
  if (!cfg) {
    return []
  }
  return redis.getAllIdsByIndex(cfg.index, cfg.pattern, cfg.re)
}

// ===================== 收集快照 =====================
// 收集指定 id（或全部）的规范化快照。idsByPlatform 为 null 表示全量。
async function gatherSnapshots(idSet) {
  const snapshots = []
  const errors = []
  for (const platform of ALL_PLATFORMS) {
    let ids
    try {
      ids = await listIds(platform)
    } catch (err) {
      errors.push({ platform, message: `enumerate failed: ${err.message}` })
      continue
    }
    for (const id of ids) {
      if (idSet && !idSet.has(id)) {
        continue
      }
      try {
        const snap = await PLATFORM_READERS[platform](id)
        if (snap) {
          snapshots.push(snap)
        }
      } catch (err) {
        logger.warn(`⚠️ Account export: read ${platform}:${id} failed: ${err.message}`)
        errors.push({ platform, id, message: err.message })
      }
    }
  }
  return { snapshots, errors }
}

// ===================== 导出 =====================
// format: 'crs' | 'sub2api' | 'cliproxyapi'
// ids: 字符串数组或 null（全量）
// 返回 { format, kind: 'json'|'zip', filename, contentType, payload(json) | buffer(zip), skipped[] }
async function exportAccounts({ format = 'crs', ids = null, exportedAt } = {}) {
  const idSet = Array.isArray(ids) && ids.length > 0 ? new Set(ids) : null
  const { snapshots, errors } = await gatherSnapshots(idSet)
  const stamp = exportedAt || new Date().toISOString()

  if (format === 'crs') {
    return {
      format,
      kind: 'json',
      filename: `crs-accounts-${fileStamp(stamp)}.json`,
      contentType: 'application/json',
      payload: {
        type: CRS_EXPORT_TYPE,
        version: CRS_EXPORT_VERSION,
        exported_at: stamp,
        accounts: snapshots.map((s) => ({
          platform: s.platform,
          id: s.id,
          name: s.name,
          data: s.data,
          meta: { source: 'crs', export_mode: 'full' }
        }))
      },
      skipped: [],
      readErrors: errors
    }
  }

  if (format === 'sub2api') {
    return buildSub2apiExport(snapshots, stamp, errors)
  }

  if (format === 'cliproxyapi') {
    return buildCliproxyExport(snapshots, stamp, errors)
  }

  throw new Error(`unknown export format: ${format}`)
}

function fileStamp(iso) {
  return String(iso).replace(/[:.]/g, '-').replace(/T/, '_').replace(/Z$/, '')
}

// sub2api 导出：可映射的进 accounts[]，其余进 skipped[]
function buildSub2apiExport(snapshots, stamp, readErrors) {
  const accounts = []
  const proxies = []
  const proxySeen = new Map() // host:port -> proxy_key
  const skipped = []

  for (const snap of snapshots) {
    const r = mappers.crsSnapshotToSub2api(snap)
    if (!r.ok) {
      skipped.push({ platform: snap.platform, id: snap.id, name: snap.name, reason: r.reason })
      continue
    }
    const acc = r.account
    // 抽取 proxy 到顶层 proxies[]，账户引用 proxy_key；去重键对齐 sub2api buildProxyKey（含认证）
    if (acc.proxy) {
      const key = [
        acc.proxy.protocol,
        acc.proxy.host,
        acc.proxy.port,
        acc.proxy.username || '',
        acc.proxy.password || ''
      ].join('|')
      let proxyKey = proxySeen.get(key)
      if (!proxyKey) {
        proxyKey = `proxy-${proxies.length + 1}`
        proxySeen.set(key, proxyKey)
        proxies.push({ proxy_key: proxyKey, name: proxyKey, status: 'active', ...acc.proxy })
      }
      acc.proxy_key = proxyKey
    }
    delete acc.proxy
    accounts.push(prune(acc))
  }

  return {
    format: 'sub2api',
    kind: 'json',
    filename: `sub2api-data-${fileStamp(stamp)}.json`,
    contentType: 'application/json',
    payload: { type: 'sub2api-data', version: 1, exported_at: stamp, proxies, accounts },
    skipped,
    readErrors
  }
}

// CLIProxyAPI 导出：OAuth 类生成 auth 文件；单条->json，多条->zip（只放 .json，不放 manifest）
function buildCliproxyExport(snapshots, stamp, readErrors) {
  const files = []
  const skipped = []
  const usedNames = new Set()

  for (const snap of snapshots) {
    const r = mappers.crsSnapshotToCliproxyAuth(snap)
    if (!r.ok) {
      skipped.push({ platform: snap.platform, id: snap.id, name: snap.name, reason: r.reason })
      continue
    }
    let { filename } = r.file
    if (usedNames.has(filename)) {
      filename = filename.replace(/\.json$/i, `-${snap.id.slice(0, 8)}.json`)
    }
    usedNames.add(filename)
    files.push({ filename, content: r.file.content })
  }

  if (files.length === 1) {
    return {
      format: 'cliproxyapi',
      kind: 'json',
      filename: files[0].filename,
      contentType: 'application/json',
      payload: files[0].content,
      skipped,
      readErrors
    }
  }

  // 没有任何账户可导出（全部不支持/读取失败）时不产出 0 字节损坏 zip，交由路由返回明确错误
  if (files.length === 0) {
    return {
      format: 'cliproxyapi',
      kind: 'empty',
      fileCount: 0,
      skipped,
      readErrors
    }
  }

  const zip = new AdmZip()
  for (const f of files) {
    zip.addFile(f.filename, Buffer.from(JSON.stringify(f.content, null, 2), 'utf8'))
  }
  return {
    format: 'cliproxyapi',
    kind: 'zip',
    filename: `cliproxyapi-auth-${fileStamp(stamp)}.zip`,
    contentType: 'application/zip',
    buffer: zip.toBuffer(),
    fileCount: files.length,
    skipped,
    readErrors
  }
}

function prune(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') {
      out[k] = v
    }
  }
  return out
}

// ===================== 解析导入 payload -> 规范化快照列表 =====================
// 返回 { format, snapshots: [{snapshot, source}], unsupported: [{name, reason}], parseErrors }
function buildSnapshotsFromImport(parsed) {
  const out = {
    format: parsed.format,
    snapshots: [],
    unsupported: [],
    parseErrors: parsed.parseErrors || []
  }

  if (parsed.format === parsers.FORMAT.CRS) {
    const accounts = Array.isArray(parsed.json?.accounts) ? parsed.json.accounts : []
    for (const a of accounts) {
      if (!a || !a.platform || !PLATFORM_READERS[a.platform]) {
        out.unsupported.push({ name: a?.name || '?', reason: `未知平台 ${a?.platform || '?'}` })
        continue
      }
      out.snapshots.push({
        snapshot: {
          platform: a.platform,
          id: a.id,
          name: a.name || a.data?.name || '',
          data: a.data || {}
        },
        source: 'crs'
      })
    }
    return out
  }

  if (parsed.format === parsers.FORMAT.SUB2API) {
    const proxyByKey = {}
    for (const p of parsed.json?.proxies || []) {
      if (p && p.proxy_key) {
        proxyByKey[p.proxy_key] = p
      }
    }
    for (const acc of parsed.json?.accounts || []) {
      const r = mappers.sub2apiToCrsSnapshot(acc, proxyByKey)
      if (r.ok) {
        out.snapshots.push({ snapshot: r.snapshot, source: 'sub2api' })
      } else {
        out.unsupported.push({ name: acc?.name || '?', reason: r.reason })
      }
    }
    return out
  }

  if (parsed.format === parsers.FORMAT.CLIPROXYAPI_JSON) {
    const r = mappers.cliproxyAuthToCrsSnapshot(parsed.json, '')
    if (r.ok) {
      out.snapshots.push({ snapshot: r.snapshot, source: 'cliproxyapi' })
    } else {
      out.unsupported.push({ name: parsed.json?.email || '?', reason: r.reason })
    }
    return out
  }

  if (parsed.format === parsers.FORMAT.CLIPROXYAPI_ZIP) {
    for (const f of parsed.authFiles || []) {
      const r = mappers.cliproxyAuthToCrsSnapshot(f.json, f.filename)
      if (r.ok) {
        out.snapshots.push({ snapshot: r.snapshot, source: 'cliproxyapi' })
      } else {
        out.unsupported.push({ name: f.filename, reason: r.reason })
      }
    }
    return out
  }

  return out
}

// ===================== 重复匹配 =====================
const crypto = require('crypto')

function fp(...parts) {
  const joined = parts.filter((p) => p !== undefined && p !== null && p !== '').join('|')
  if (!joined) {
    return ''
  }
  return crypto.createHash('sha256').update(joined).digest('hex').slice(0, 24)
}

// 为快照计算业务指纹（用于跨格式匹配现有账户）
function snapshotFingerprint(snap) {
  const d = snap.data || {}
  switch (snap.platform) {
    case CRS_PLATFORM.CLAUDE: {
      const o = d.claudeAiOauth || {}
      return fp('claude', d.email || '', o.refreshToken || '')
    }
    case CRS_PLATFORM.OPENAI: {
      const o = d.openaiOauth || {}
      const info = d.accountInfo || {}
      return fp(
        'openai',
        info.email || '',
        info.accountId || '',
        o.refreshToken || d.refreshToken || ''
      )
    }
    case CRS_PLATFORM.GEMINI: {
      const o = typeof d.geminiOauth === 'string' ? sj(d.geminiOauth, {}) : d.geminiOauth || {}
      return fp(
        'gemini',
        d.oauthProvider || 'gemini-cli',
        d.projectId || '',
        o.refresh_token || d.refreshToken || ''
      )
    }
    case CRS_PLATFORM.GEMINI_API:
      return fp('gemini-api', d.apiKey || '', d.baseUrl || '')
    case CRS_PLATFORM.CLAUDE_CONSOLE:
      return fp('claude-console', d.apiUrl || '', d.apiKey || '')
    case CRS_PLATFORM.CCR:
      return fp('ccr', d.apiUrl || '', d.apiKey || '')
    case CRS_PLATFORM.OPENAI_RESPONSES:
      return fp('openai-responses', d.baseApi || '', d.apiKey || '')
    case CRS_PLATFORM.AZURE_OPENAI:
      return fp('azure', d.azureEndpoint || '', d.deploymentName || '', d.apiKey || '')
    case CRS_PLATFORM.BEDROCK: {
      const c = d.awsCredentials || {}
      return fp(
        'bedrock',
        d.credentialType || '',
        d.region || '',
        c.accessKeyId || d.bearerToken || ''
      )
    }
    case CRS_PLATFORM.DROID: {
      // API key 模式账户 refreshToken 为空，用 apiKeys 集合做指纹（排序保证稳定）；
      // endpointType 决定路由行为，同 keys 不同端点是不同账户（兜底 anthropic 与读取侧一致）
      const apiKeys = Array.isArray(d.apiKeys)
        ? d.apiKeys.filter(Boolean).slice().sort().join(',')
        : ''
      return fp(
        'droid',
        d.endpointType || 'anthropic',
        d.ownerEmail || '',
        d.userId || '',
        d.refreshToken || apiKeys
      )
    }
    case CRS_PLATFORM.GROK:
      return fp(
        'grok',
        d.authType || 'oauth',
        d.email || '',
        d.refreshToken || d.apiKey || '',
        d.baseUrl || ''
      )
    default:
      return ''
  }
}

// 建立现有账户索引：platform -> { byId, byFp, byNameKey }
async function buildExistingIndex() {
  const index = {}
  for (const platform of ALL_PLATFORMS) {
    const byId = new Map()
    const byFp = new Map()
    const byNameKey = new Map()
    let ids = []
    try {
      ids = await listIds(platform)
    } catch (_) {
      ids = []
    }
    for (const id of ids) {
      let snap
      try {
        snap = await PLATFORM_READERS[platform](id)
      } catch (_) {
        snap = null
      }
      if (!snap) {
        continue
      }
      byId.set(id, snap)
      const f = snapshotFingerprint(snap)
      if (f) {
        byFp.set(f, id)
      }
      if (snap.name) {
        byNameKey.set(`${platform}:${snap.name}`, id)
      }
    }
    index[platform] = { byId, byFp, byNameKey }
  }
  return index
}

// 在现有索引里给快照定位匹配项：返回 { action, matchId, matchReason }
function matchSnapshot(item, existing) {
  const { snapshot, source } = item
  const idx = existing[snapshot.platform]
  if (!idx) {
    return { action: 'unsupported', matchReason: 'none' }
  }
  // 1) CRS 原生稳定 id
  if (source === 'crs' && snapshot.id && idx.byId.has(snapshot.id)) {
    return { action: 'update', matchId: snapshot.id, matchReason: 'id' }
  }
  // 2) 业务指纹
  const f = snapshotFingerprint(snapshot)
  if (f && idx.byFp.has(f)) {
    return { action: 'update', matchId: idx.byFp.get(f), matchReason: 'credential-fingerprint' }
  }
  // 3) 弱匹配：平台+名称
  if (snapshot.name && idx.byNameKey.has(`${snapshot.platform}:${snapshot.name}`)) {
    return {
      action: 'conflict',
      matchId: idx.byNameKey.get(`${snapshot.platform}:${snapshot.name}`),
      matchReason: 'exact-name-platform'
    }
  }
  return { action: 'create', matchReason: 'none' }
}

// ===================== inspect =====================
async function inspectImport({ filename, contentBase64 } = {}) {
  const parsed = parsers.parseImportPayload({ filename, contentBase64 })
  if (parsed.format === parsers.FORMAT.UNKNOWN) {
    return {
      format: 'unknown',
      summary: { total: 0, importable: 0, unsupported: 0, conflicts: 0 },
      items: [],
      errors: parsed.parseErrors || [{ message: '无法识别文件格式' }]
    }
  }

  const built = buildSnapshotsFromImport(parsed)
  const existing = await buildExistingIndex()

  const items = []
  for (const it of built.snapshots) {
    const m = matchSnapshot(it, existing)
    items.push({
      platform: it.snapshot.platform,
      name: it.snapshot.name || '(unnamed)',
      source: it.source,
      action: m.action,
      matchId: m.matchId || null,
      matchReason: m.matchReason,
      warnings: validateSnapshotWarnings(it.snapshot)
    })
  }
  for (const u of built.unsupported) {
    items.push({
      platform: '-',
      name: u.name || '(unknown)',
      source: built.format,
      action: 'unsupported',
      matchReason: 'none',
      warnings: [u.reason]
    })
  }

  return {
    format: built.format,
    summary: {
      total: items.length,
      importable: items.filter((i) => i.action === 'create' || i.action === 'update').length,
      unsupported: items.filter((i) => i.action === 'unsupported').length,
      conflicts: items.filter((i) => i.action === 'conflict').length
    },
    items,
    errors: built.parseErrors || []
  }
}

function validateSnapshotWarnings(snapshot) {
  const warnings = []
  const d = snapshot.data || {}
  if (snapshot.platform === CRS_PLATFORM.CLAUDE && !d.claudeAiOauth?.refreshToken) {
    warnings.push('缺少 refreshToken，token 过期后无法自动刷新')
  }
  if (snapshot.platform === CRS_PLATFORM.GEMINI_API && !d.apiKey) {
    warnings.push('缺少 apiKey')
  }
  return warnings
}

// ===================== import 执行 =====================
// options: { allowCreate=true, allowUpdate=true }
async function importAccounts({ filename, contentBase64, options = {} } = {}) {
  const allowCreate = options.allowCreate !== false
  const allowUpdate = options.allowUpdate !== false

  const parsed = parsers.parseImportPayload({ filename, contentBase64 })
  if (parsed.format === parsers.FORMAT.UNKNOWN) {
    return {
      format: 'unknown',
      created: 0,
      updated: 0,
      skipped: 0,
      unsupported: 0,
      failed: 0,
      results: [],
      errors: parsed.parseErrors || [{ message: '无法识别文件格式' }]
    }
  }

  const built = buildSnapshotsFromImport(parsed)
  const existing = await buildExistingIndex()
  const results = []
  let created = 0
  let updated = 0
  let skipped = 0
  let failed = 0

  for (const it of built.snapshots) {
    const m = matchSnapshot(it, existing)
    const label = {
      platform: it.snapshot.platform,
      name: it.snapshot.name || '(unnamed)',
      source: it.source
    }
    try {
      if (m.action === 'update') {
        if (!allowUpdate) {
          skipped += 1
          results.push({ ...label, action: 'skip', reason: 'update disabled' })
          continue
        }
        await applyUpdate(it.snapshot, m.matchId)
        updated += 1
        results.push({ ...label, action: 'update', matchId: m.matchId, matchReason: m.matchReason })
      } else if (m.action === 'conflict') {
        skipped += 1
        results.push({
          ...label,
          action: 'skip',
          reason: '名称冲突但凭据不匹配，已跳过',
          matchId: m.matchId
        })
      } else if (m.action === 'create') {
        if (!allowCreate) {
          skipped += 1
          results.push({ ...label, action: 'skip', reason: 'create disabled' })
          continue
        }
        const id = await applyCreate(it.snapshot)
        created += 1
        results.push({ ...label, action: 'create', id })
      } else {
        results.push({ ...label, action: 'unsupported' })
      }
    } catch (err) {
      failed += 1
      logger.error(`❌ Account import failed (${label.platform}/${label.name}): ${err.message}`)
      results.push({ ...label, action: 'failed', error: err.message })
    }
  }

  for (const u of built.unsupported) {
    results.push({ platform: '-', name: u.name, action: 'unsupported', reason: u.reason })
  }

  return {
    format: built.format,
    created,
    updated,
    skipped,
    unsupported: built.unsupported.length,
    failed,
    results,
    errors: built.parseErrors || []
  }
}

// ===================== create / update 分发 =====================
// 把规范化快照 data 透传给对应 service.createAccount，返回新账户 id。
async function applyCreate(snapshot) {
  const d = { ...(snapshot.data || {}) }
  switch (snapshot.platform) {
    case CRS_PLATFORM.CLAUDE: {
      if (d.subscriptionExpiresAt !== undefined && d.expiresAt === undefined) {
        d.expiresAt = d.subscriptionExpiresAt
      }
      // claudeAiOauth 必须含 expiresAt(可 toString) 与 scopes(数组)，否则 createAccount 抛错
      if (d.claudeAiOauth) {
        d.claudeAiOauth = normalizeClaudeOauth(d.claudeAiOauth)
      }
      const acc = await claudeAccountService.createAccount(d)
      return acc?.id
    }
    case CRS_PLATFORM.CLAUDE_CONSOLE:
      return (await claudeConsoleAccountService.createAccount(d))?.id
    case CRS_PLATFORM.CCR:
      return (await ccrAccountService.createAccount(d))?.id
    case CRS_PLATFORM.OPENAI:
      return (await openaiAccountService.createAccount(d))?.id
    case CRS_PLATFORM.OPENAI_RESPONSES:
      return (await openaiResponsesAccountService.createAccount(d))?.id
    case CRS_PLATFORM.GEMINI:
      return (await geminiAccountService.createAccount(d))?.id
    case CRS_PLATFORM.GEMINI_API:
      return (await geminiApiAccountService.createAccount(d))?.id
    case CRS_PLATFORM.AZURE_OPENAI:
      return (await azureOpenaiAccountService.createAccount(d))?.id
    case CRS_PLATFORM.BEDROCK: {
      const res = await bedrockAccountService.createAccount(d)
      return res?.id || res?.data?.id
    }
    case CRS_PLATFORM.DROID:
      return (await droidAccountService.createAccount(d))?.id
    case CRS_PLATFORM.GROK:
      return (await grokAccountService.createAccount(d))?.id
    default:
      throw new Error(`unsupported platform for create: ${snapshot.platform}`)
  }
}

// claudeAiOauth 兜底：scopes -> 数组；expiresAt -> 数字（默认 +1h）
function normalizeClaudeOauth(oauth) {
  const o = { ...oauth }
  if (!Array.isArray(o.scopes)) {
    o.scopes =
      typeof o.scopes === 'string' && o.scopes
        ? o.scopes.split(' ').filter(Boolean)
        : ['user:profile', 'user:inference']
  }
  if (o.expiresAt === undefined || o.expiresAt === null || o.expiresAt === '') {
    o.expiresAt = Date.now() + 3600000
  }
  return o
}

// 更新：把可写字段透传给 service.updateAccount。各 service 的 allowedUpdates 会过滤无关字段。
async function applyUpdate(snapshot, accountId) {
  const updates = buildUpdatePayload(snapshot)
  switch (snapshot.platform) {
    case CRS_PLATFORM.CLAUDE:
      if (updates.claudeAiOauth) {
        updates.claudeAiOauth = normalizeClaudeOauth(updates.claudeAiOauth)
      }
      return claudeAccountService.updateAccount(accountId, updates)
    case CRS_PLATFORM.CLAUDE_CONSOLE:
      return claudeConsoleAccountService.updateAccount(accountId, updates)
    case CRS_PLATFORM.CCR:
      return ccrAccountService.updateAccount(accountId, updates)
    case CRS_PLATFORM.OPENAI:
      return openaiAccountService.updateAccount(accountId, updates)
    case CRS_PLATFORM.OPENAI_RESPONSES:
      return openaiResponsesAccountService.updateAccount(accountId, updates)
    case CRS_PLATFORM.GEMINI:
      return geminiAccountService.updateAccount(accountId, updates)
    case CRS_PLATFORM.GEMINI_API:
      return geminiApiAccountService.updateAccount(accountId, updates)
    case CRS_PLATFORM.AZURE_OPENAI:
      return azureOpenaiAccountService.updateAccount(accountId, updates)
    case CRS_PLATFORM.BEDROCK:
      return bedrockAccountService.updateAccount(accountId, updates)
    case CRS_PLATFORM.DROID:
      updates.apiKeyUpdateMode = 'replace'
      return droidAccountService.updateAccount(accountId, updates)
    case CRS_PLATFORM.GROK:
      return grokAccountService.updateAccount(accountId, updates)
    default:
      throw new Error(`unsupported platform for update: ${snapshot.platform}`)
  }
}

// 更新只透传凭据与少量业务字段，避免覆盖运行态/调度态
function buildUpdatePayload(snapshot) {
  const d = snapshot.data || {}
  const u = {}
  const keys = [
    'name',
    'description',
    'email',
    'claudeAiOauth',
    'openaiOauth',
    'accountInfo',
    'geminiOauth',
    'oauthProvider',
    'projectId',
    'refreshToken',
    'accessToken',
    'idToken',
    'apiKey',
    'apiUrl',
    'baseUrl',
    'baseApi',
    'azureEndpoint',
    'apiVersion',
    'deploymentName',
    'awsCredentials',
    'bearerToken',
    'credentialType',
    'region',
    'proxy',
    'supportedModels',
    'subscriptionExpiresAt',
    'subscriptionInfo',
    'maxConcurrency',
    'disableTempUnavailable',
    'tempUnavailable503TtlSeconds',
    'tempUnavailable5xxTtlSeconds',
    'endpointType',
    'organizationId',
    'ownerEmail',
    'ownerName',
    'userId',
    'tokenType',
    'authenticationMethod',
    'expiresAt',
    'expiresIn',
    'apiKeys',
    'userAgent',
    'providerEndpoint',
    'defaultModel',
    'disableAutoProtection',
    'authType',
    'clientId',
    'mediaBaseUrl',
    'planType',
    'subscriptionTier'
  ]
  for (const k of keys) {
    if (d[k] !== undefined && d[k] !== null) {
      u[k] = d[k]
    }
  }
  return u
}

module.exports = {
  CRS_PLATFORM,
  exportAccounts,
  inspectImport,
  importAccounts,
  // 暴露内部件以便单测
  _internal: {
    buildUpdatePayload,
    snapshotFingerprint,
    buildSnapshotsFromImport,
    matchSnapshot,
    buildSub2apiExport,
    buildCliproxyExport
  }
}

/**
 * Account Migration Mappers
 * 纯格式转换层：CRS 规范化快照 <-> sub2api DataAccount <-> CLIProxyAPI auth 文件。
 *
 * 约定：
 *   - 本模块不读 Redis、不加解密。输入输出都是明文的「规范化快照」。
 *   - 规范化快照（snapshot）：
 *       { platform, id, name, description, data: {...} }
 *     其中 data 的字段尽量对齐对应 service.createAccount 的入参，使 CRS 原生导入可直接透传。
 *   - 凭据一律明文。
 *
 * 跨格式转换返回统一形状：
 *   成功 -> { ok: true, ...payload }
 *   不支持 -> { ok: false, unsupported: true, reason }
 */

// CRS 平台标识（与 AccountsView / 各 service.platform 对齐）
const CRS_PLATFORM = {
  CLAUDE: 'claude',
  CLAUDE_CONSOLE: 'claude-console',
  GEMINI: 'gemini',
  GEMINI_API: 'gemini-api',
  OPENAI: 'openai',
  OPENAI_RESPONSES: 'openai-responses',
  AZURE_OPENAI: 'azure_openai',
  BEDROCK: 'bedrock',
  DROID: 'droid',
  CCR: 'ccr',
  GROK: 'grok'
}

// sub2api 平台/类型常量（已核实 domain_constants.go）
const SUB2API_PLATFORM = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  GEMINI: 'gemini',
  ANTIGRAVITY: 'antigravity',
  GROK: 'grok'
}
const SUB2API_TYPE = {
  OAUTH: 'oauth',
  SETUP_TOKEN: 'setup-token',
  API_KEY: 'apikey',
  UPSTREAM: 'upstream'
}

function unsupported(reason) {
  return { ok: false, unsupported: true, reason }
}

// ===================== CRS snapshot -> sub2api DataAccount =====================
// 仅 OAuth / Gemini API 可可靠映射；其余类型返回 unsupported。

function crsSnapshotToSub2api(snapshot) {
  const d = snapshot.data || {}
  const base = {
    name: snapshot.name || d.name || 'Unnamed',
    notes: d.description || snapshot.description || undefined,
    priority: toInt(d.priority, 50),
    concurrency: toInt(d.maxConcurrency || d.maxConcurrentTasks, 0),
    proxy: normalizeProxyForExport(d.proxy)
  }

  switch (snapshot.platform) {
    case CRS_PLATFORM.CLAUDE: {
      const oauth = d.claudeAiOauth || {}
      const isSetup = Array.isArray(oauth.scopes) ? !oauth.scopes.includes('user:profile') : false
      return {
        ok: true,
        account: {
          ...base,
          platform: SUB2API_PLATFORM.ANTHROPIC,
          type: isSetup ? SUB2API_TYPE.SETUP_TOKEN : SUB2API_TYPE.OAUTH,
          credentials: pruneEmpty({
            access_token: oauth.accessToken,
            refresh_token: oauth.refreshToken,
            expires_at: msToIso(oauth.expiresAt),
            scope: Array.isArray(oauth.scopes) ? oauth.scopes.join(' ') : undefined,
            token_type: 'Bearer'
          })
        }
      }
    }
    case CRS_PLATFORM.OPENAI:
      return mapOpenAiToSub2api(d, base)
    case CRS_PLATFORM.OPENAI_RESPONSES:
      return mapOpenAiResponsesToSub2api(d, base)
    case CRS_PLATFORM.GEMINI:
      return mapGeminiOAuthToSub2api(d, base)
    case CRS_PLATFORM.GEMINI_API:
      return mapGeminiApiToSub2api(d, base)
    case CRS_PLATFORM.GROK: {
      const isApiKey = d.authType === 'apikey'
      return {
        ok: true,
        account: {
          ...base,
          platform: SUB2API_PLATFORM.GROK,
          type: isApiKey ? SUB2API_TYPE.API_KEY : SUB2API_TYPE.OAUTH,
          credentials: pruneEmpty(
            isApiKey
              ? {
                  api_key: d.apiKey,
                  base_url: d.baseUrl
                }
              : {
                  access_token: d.accessToken,
                  refresh_token: d.refreshToken,
                  id_token: d.idToken,
                  expires_at: d.expiresAt,
                  client_id: d.clientId,
                  email: d.email,
                  base_url: d.baseUrl,
                  token_type: 'Bearer'
                }
          )
        }
      }
    }
    default:
      return unsupported(`sub2api 格式不支持 ${snapshot.platform} 账户`)
  }
}

// ---------- shared helpers ----------
function toInt(v, dflt) {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : dflt
}

function pruneEmpty(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined && v !== null && v !== '') {
      out[k] = v
    }
  }
  return out
}

// 毫秒时间戳 / ISO 字符串 -> ISO 字符串（容错）
function msToIso(v) {
  if (!v) {
    return undefined
  }
  if (typeof v === 'string' && v.includes('T')) {
    return v
  }
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) {
    return undefined
  }
  return new Date(n).toISOString()
}

// CRS proxy 对象 -> sub2api DataProxy（缺字段则返回 null）
function normalizeProxyForExport(proxy) {
  const p = typeof proxy === 'string' ? safeJson(proxy) : proxy
  if (!p || typeof p !== 'object') {
    return null
  }
  const protocol = p.protocol || p.type || p.scheme || ''
  const host = p.host || ''
  const port = Number(p.port || 0)
  if (!protocol || !host || !Number.isFinite(port) || port <= 0) {
    return null
  }
  return {
    protocol: String(protocol),
    host: String(host),
    port,
    username: p.username ? String(p.username) : '',
    password: p.password ? String(p.password) : ''
  }
}

function safeJson(raw, fallback = null) {
  if (!raw || typeof raw !== 'string') {
    return fallback
  }
  try {
    return JSON.parse(raw)
  } catch (_) {
    return fallback
  }
}

// ---------- sub2api 子映射 ----------
function mapOpenAiToSub2api(d, base) {
  const oauth = d.openaiOauth || {}
  return {
    ok: true,
    account: {
      ...base,
      platform: SUB2API_PLATFORM.OPENAI,
      type: SUB2API_TYPE.OAUTH,
      credentials: pruneEmpty({
        access_token: d.accessToken || oauth.accessToken,
        refresh_token: d.refreshToken || oauth.refreshToken,
        id_token: d.idToken || oauth.idToken,
        expires_at: d.expiresAt,
        chatgpt_account_id: d.accountId,
        chatgpt_user_id: d.chatgptUserId,
        organization_id: d.organizationId,
        token_type: 'Bearer'
      })
    }
  }
}

function mapOpenAiResponsesToSub2api(d, base) {
  return {
    ok: true,
    account: {
      ...base,
      platform: SUB2API_PLATFORM.OPENAI,
      type: SUB2API_TYPE.API_KEY,
      credentials: pruneEmpty({
        api_key: d.apiKey,
        base_url: d.baseApi,
        // 扩展字段（sub2api credentials 为 map[string]any，多余字段无害）：
        // 落盘运行语义（relay 缺省按 responses），CRS->sub2api->CRS 往返不漂移
        provider_endpoint: d.providerEndpoint || 'responses'
      })
    }
  }
}

function mapGeminiOAuthToSub2api(d, base) {
  const oauth =
    typeof d.geminiOauth === 'string' ? safeJson(d.geminiOauth, {}) : d.geminiOauth || {}
  const platform =
    d.oauthProvider === 'antigravity' ? SUB2API_PLATFORM.ANTIGRAVITY : SUB2API_PLATFORM.GEMINI
  return {
    ok: true,
    account: {
      ...base,
      platform,
      type: SUB2API_TYPE.OAUTH,
      credentials: pruneEmpty({
        access_token: oauth.access_token || d.accessToken,
        refresh_token: oauth.refresh_token || d.refreshToken,
        expires_at: msToIso(oauth.expiry_date) || d.expiresAt,
        scope: oauth.scope || d.scopes,
        project_id: d.projectId,
        token_type: 'Bearer'
      })
    }
  }
}

function mapGeminiApiToSub2api(d, base) {
  return {
    ok: true,
    account: {
      ...base,
      platform: SUB2API_PLATFORM.GEMINI,
      type: SUB2API_TYPE.API_KEY,
      credentials: pruneEmpty({
        api_key: d.apiKey,
        base_url: d.baseUrl
      })
    }
  }
}

// ===================== sub2api DataAccount -> CRS snapshot =====================
// 把 sub2api 账户映射回 CRS 可创建/更新的快照；不支持的组合返回 unsupported。
function sub2apiToCrsSnapshot(acc, proxyByKey = {}) {
  const platform = String(acc.platform || '').toLowerCase()
  const type = String(acc.type || '').toLowerCase()
  const cred = acc.credentials || {}
  const proxy = acc.proxy_key ? proxyForImport(proxyByKey[acc.proxy_key]) : null
  const common = {
    name: acc.name || 'Imported',
    description: typeof acc.notes === 'string' ? acc.notes : '',
    priority: toInt(acc.priority, 50),
    proxy
  }

  if (platform === SUB2API_PLATFORM.ANTHROPIC) {
    const scopes = cred.scope
      ? cred.scope.split(' ').filter(Boolean)
      : type === SUB2API_TYPE.SETUP_TOKEN
        ? ['user:inference']
        : ['user:profile', 'user:inference']
    return {
      ok: true,
      snapshot: {
        platform: CRS_PLATFORM.CLAUDE,
        name: common.name,
        description: common.description,
        data: {
          ...common,
          claudeAiOauth: pruneEmpty({
            accessToken: cred.access_token,
            refreshToken: cred.refresh_token,
            expiresAt: isoToMs(cred.expires_at),
            scopes
          })
        }
      }
    }
  }
  if (platform === SUB2API_PLATFORM.OPENAI && type === SUB2API_TYPE.OAUTH) {
    return {
      ok: true,
      snapshot: {
        platform: CRS_PLATFORM.OPENAI,
        name: common.name,
        description: common.description,
        data: {
          ...common,
          openaiOauth: pruneEmpty({
            accessToken: cred.access_token,
            refreshToken: cred.refresh_token,
            idToken: cred.id_token
          }),
          accountInfo: pruneEmpty({
            email: cred.email,
            accountId: cred.chatgpt_account_id,
            chatgptUserId: cred.chatgpt_user_id,
            organizationId: cred.organization_id
          })
        }
      }
    }
  }
  if (
    platform === SUB2API_PLATFORM.OPENAI &&
    (type === SUB2API_TYPE.API_KEY || type === SUB2API_TYPE.UPSTREAM)
  ) {
    const apiKey = cred.api_key || cred.apiKey
    if (!apiKey) {
      return unsupported('sub2api openai apikey/upstream 缺少 api_key')
    }
    return {
      ok: true,
      snapshot: {
        platform: CRS_PLATFORM.OPENAI_RESPONSES,
        name: common.name,
        description: common.description,
        data: {
          ...common,
          apiKey,
          baseApi: cred.base_url || 'https://api.openai.com',
          // CRS 往返文件带 provider_endpoint 扩展字段则还原；
          // 纯 sub2api 文件无此字段，按泛 OpenAI 兼容上游透传原始路径（auto）
          providerEndpoint: cred.provider_endpoint === 'responses' ? 'responses' : 'auto'
        }
      }
    }
  }
  if (
    (platform === SUB2API_PLATFORM.GEMINI || platform === SUB2API_PLATFORM.ANTIGRAVITY) &&
    type === SUB2API_TYPE.OAUTH
  ) {
    return geminiOAuthSnapshotFromCreds(cred, common, platform === SUB2API_PLATFORM.ANTIGRAVITY)
  }
  if (platform === SUB2API_PLATFORM.GEMINI && type === SUB2API_TYPE.API_KEY) {
    return {
      ok: true,
      snapshot: {
        platform: CRS_PLATFORM.GEMINI_API,
        name: common.name,
        description: common.description,
        data: { ...common, apiKey: cred.api_key, baseUrl: cred.base_url || undefined }
      }
    }
  }
  if (platform === SUB2API_PLATFORM.GROK) {
    const isApiKey = type === SUB2API_TYPE.API_KEY
    return {
      ok: true,
      snapshot: {
        platform: CRS_PLATFORM.GROK,
        name: common.name,
        description: common.description,
        data: {
          ...common,
          authType: isApiKey ? 'apikey' : 'oauth',
          apiKey: isApiKey ? cred.api_key || '' : '',
          accessToken: !isApiKey ? cred.access_token || '' : '',
          refreshToken: !isApiKey ? cred.refresh_token || '' : '',
          idToken: !isApiKey ? cred.id_token || '' : '',
          expiresAt: cred.expires_at || '',
          email: cred.email || '',
          clientId: cred.client_id || '',
          baseUrl: cred.base_url || ''
        }
      }
    }
  }
  return unsupported(`sub2api 账户 platform=${platform || '?'} type=${type || '?'} 暂不支持导入`)
}

// ---------- import-side helpers ----------
function isoToMs(v) {
  if (!v) {
    return undefined
  }
  if (typeof v === 'number') {
    return v
  }
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : undefined
}

// sub2api DataProxy -> CRS proxy 对象
function proxyForImport(p) {
  if (!p || typeof p !== 'object') {
    return null
  }
  const port = Number(p.port || 0)
  if (!p.protocol || !p.host || !Number.isFinite(port) || port <= 0) {
    return null
  }
  return {
    type: String(p.protocol),
    host: String(p.host),
    port,
    username: p.username || '',
    password: p.password || ''
  }
}

// 从凭据构造 CRS Gemini OAuth 快照（gemini-cli / antigravity 共用）
function geminiOAuthSnapshotFromCreds(cred, common, isAntigravity) {
  const geminiOauth = pruneEmpty({
    access_token: cred.access_token,
    refresh_token: cred.refresh_token,
    scope: cred.scope,
    token_type: 'Bearer',
    expiry_date: isoToMs(cred.expires_at)
  })
  return {
    ok: true,
    snapshot: {
      platform: CRS_PLATFORM.GEMINI,
      name: common.name,
      description: common.description,
      data: {
        ...common,
        geminiOauth,
        oauthProvider: isAntigravity ? 'antigravity' : 'gemini-cli',
        projectId: cred.project_id || undefined
      }
    }
  }
}

// ===================== CLIProxyAPI auth 文件 <-> CRS snapshot =====================
// 单个 auth 文件 -> CRS 快照。已核实 token.go / gemini_token.go / antigravity metadata。
function cliproxyAuthToCrsSnapshot(authFile, filename = '') {
  const type = String(authFile.type || '').toLowerCase()
  const name = deriveName(authFile, filename, type)
  const common = { name, description: '', proxy: null }

  switch (type) {
    case 'claude':
      return {
        ok: true,
        snapshot: {
          platform: CRS_PLATFORM.CLAUDE,
          name,
          description: '',
          data: {
            ...common,
            claudeAiOauth: pruneEmpty({
              accessToken: authFile.access_token,
              refreshToken: authFile.refresh_token,
              expiresAt: isoToMs(authFile.expired),
              scopes: ['user:profile', 'user:inference']
            })
          }
        }
      }
    case 'codex':
      return {
        ok: true,
        snapshot: {
          platform: CRS_PLATFORM.OPENAI,
          name,
          description: '',
          data: {
            ...common,
            openaiOauth: pruneEmpty({
              accessToken: authFile.access_token,
              refreshToken: authFile.refresh_token,
              idToken: authFile.id_token
            }),
            accountInfo: pruneEmpty({ accountId: authFile.account_id, email: authFile.email })
          }
        }
      }
    case 'gemini':
      return {
        ok: true,
        snapshot: {
          platform: CRS_PLATFORM.GEMINI,
          name,
          description: '',
          data: {
            ...common,
            geminiOauth: normalizeGeminiToken(authFile.token),
            oauthProvider: 'gemini-cli',
            projectId: authFile.project_id || undefined
          }
        }
      }
    case 'antigravity':
      return {
        ok: true,
        snapshot: {
          platform: CRS_PLATFORM.GEMINI,
          name,
          description: '',
          data: {
            ...common,
            geminiOauth: pruneEmpty({
              access_token: authFile.access_token,
              refresh_token: authFile.refresh_token,
              token_type: 'Bearer',
              expiry_date: isoToMs(authFile.expired)
            }),
            oauthProvider: 'antigravity',
            projectId: authFile.project_id || undefined
          }
        }
      }
    case 'vertex':
      return unsupported('CLIProxyAPI vertex(service account) 暂无对应 CRS 账户类型')
    case 'xai':
      return {
        ok: true,
        snapshot: {
          platform: CRS_PLATFORM.GROK,
          name,
          description: '',
          data: {
            ...common,
            authType: 'oauth',
            accessToken: authFile.access_token || '',
            refreshToken: authFile.refresh_token || '',
            idToken: authFile.id_token || '',
            expiresAt: authFile.expired || authFile.expires_at || '',
            email: authFile.email || '',
            clientId: authFile.client_id || '',
            baseUrl: authFile.base_url || authFile.baseUrl || ''
          }
        }
      }
    default:
      return unsupported(`CLIProxyAPI type=${type || '?'} 暂不支持导入`)
  }
}

// Gemini auth 文件的 token 字段保留原始 OAuth 对象
function normalizeGeminiToken(token) {
  if (!token) {
    return {}
  }
  return typeof token === 'string' ? safeJson(token, {}) : token
}

function deriveName(authFile, filename, type) {
  if (authFile.email) {
    return authFile.email
  }
  if (filename) {
    return filename.replace(/\.json$/i, '')
  }
  return `${type || 'imported'}-account`
}

// ===================== CRS snapshot -> CLIProxyAPI auth 文件 =====================
// 仅 OAuth 类账户可导出为 auth 文件；其余返回 unsupported。
// 返回 { ok, file: { filename, content } } —— content 已是合法 auth json 对象（带 type）。
function crsSnapshotToCliproxyAuth(snapshot) {
  const d = snapshot.data || {}
  switch (snapshot.platform) {
    case CRS_PLATFORM.CLAUDE: {
      const oauth = d.claudeAiOauth || {}
      const email = d.email || ''
      return wrapAuthFile('claude', email, {
        type: 'claude',
        access_token: oauth.accessToken || '',
        refresh_token: oauth.refreshToken || '',
        expired: msToIso(oauth.expiresAt) || '',
        email
      })
    }
    case CRS_PLATFORM.OPENAI: {
      const oauth = d.openaiOauth || {}
      const info = d.accountInfo || {}
      const email = info.email || d.email || ''
      return wrapAuthFile('codex', email, {
        type: 'codex',
        id_token: d.idToken || oauth.idToken || '',
        access_token: d.accessToken || oauth.accessToken || '',
        refresh_token: d.refreshToken || oauth.refreshToken || '',
        account_id: info.accountId || d.accountId || '',
        email
      })
    }
    case CRS_PLATFORM.GEMINI: {
      const isAntigravity = d.oauthProvider === 'antigravity'
      const oauth =
        typeof d.geminiOauth === 'string' ? safeJson(d.geminiOauth, {}) : d.geminiOauth || {}
      const email = d.email || ''
      if (isAntigravity) {
        return wrapAuthFile('antigravity', email, {
          type: 'antigravity',
          access_token: oauth.access_token || d.accessToken || '',
          refresh_token: oauth.refresh_token || d.refreshToken || '',
          expired: msToIso(oauth.expiry_date) || d.expiresAt || '',
          email,
          project_id: d.projectId || ''
        })
      }
      return wrapAuthFile('gemini', email, {
        type: 'gemini',
        token: oauth,
        project_id: d.projectId || '',
        email
      })
    }
    case CRS_PLATFORM.GROK: {
      const email = d.email || ''
      return wrapAuthFile('xai', email, {
        type: 'xai',
        access_token: d.accessToken || '',
        refresh_token: d.refreshToken || '',
        id_token: d.idToken || '',
        expired: d.expiresAt || '',
        email,
        client_id: d.clientId || '',
        base_url: d.baseUrl || ''
      })
    }
    default:
      return unsupported(`CLIProxyAPI auth 文件不支持 ${snapshot.platform} 账户（仅 OAuth 类）`)
  }
}

function wrapAuthFile(provider, email, content) {
  const safeEmail = (email || '').replace(/[^a-zA-Z0-9._@-]/g, '_')
  const filename = safeEmail ? `${provider}-${safeEmail}.json` : `${provider}.json`
  return { ok: true, file: { filename, content } }
}

module.exports = {
  CRS_PLATFORM,
  SUB2API_PLATFORM,
  SUB2API_TYPE,
  unsupported,
  crsSnapshotToSub2api,
  sub2apiToCrsSnapshot,
  cliproxyAuthToCrsSnapshot,
  crsSnapshotToCliproxyAuth
}

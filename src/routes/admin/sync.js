/**
 * Admin Routes - Sync / Export (for migration)
 * Exports account data (including secrets) for safe server-to-server syncing.
 */

const express = require('express')
const router = express.Router()

const { authenticateAdmin } = require('../../middleware/auth')
const redis = require('../../models/redis')
const claudeAccountService = require('../../services/account/claudeAccountService')
const claudeConsoleAccountService = require('../../services/account/claudeConsoleAccountService')
const openaiAccountService = require('../../services/account/openaiAccountService')
const openaiResponsesAccountService = require('../../services/account/openaiResponsesAccountService')
const logger = require('../../utils/logger')

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue
  }
  if (value === true || value === 'true') {
    return true
  }
  if (value === false || value === 'false') {
    return false
  }
  return defaultValue
}

function normalizeProxy(proxy) {
  if (!proxy || typeof proxy !== 'object') {
    return null
  }

  const protocol = proxy.protocol || proxy.type || proxy.scheme || ''
  const host = proxy.host || ''
  const port = Number(proxy.port || 0)

  if (!protocol || !host || !Number.isFinite(port) || port <= 0) {
    return null
  }

  return {
    protocol: String(protocol),
    host: String(host),
    port,
    username: proxy.username ? String(proxy.username) : '',
    password: proxy.password ? String(proxy.password) : ''
  }
}

function buildModelMappingFromSupportedModels(supportedModels) {
  if (!supportedModels) {
    return null
  }

  if (Array.isArray(supportedModels)) {
    const mapping = {}
    for (const model of supportedModels) {
      if (typeof model === 'string' && model.trim()) {
        mapping[model.trim()] = model.trim()
      }
    }
    return Object.keys(mapping).length ? mapping : null
  }

  if (typeof supportedModels === 'object') {
    const mapping = {}
    for (const [from, to] of Object.entries(supportedModels)) {
      if (typeof from === 'string' && typeof to === 'string' && from.trim() && to.trim()) {
        mapping[from.trim()] = to.trim()
      }
    }
    return Object.keys(mapping).length ? mapping : null
  }

  return null
}

function safeParseJson(raw, fallback = null) {
  if (!raw || typeof raw !== 'string') {
    return fallback
  }
  try {
    return JSON.parse(raw)
  } catch (_) {
    return fallback
  }
}

// Export accounts for migration (includes secrets).
// GET /admin/sync/export-accounts?include_secrets=true
router.get('/sync/export-accounts', authenticateAdmin, async (req, res) => {
  try {
    const includeSecrets = toBool(req.query.include_secrets, false)
    if (!includeSecrets) {
      return res.status(400).json({
        success: false,
        error: 'include_secrets_required',
        message: 'Set include_secrets=true to export secrets'
      })
    }

    // ===== Claude official OAuth / Setup Token accounts =====
    const rawClaudeAccounts = await redis.getAllClaudeAccounts()
    const claudeAccounts = rawClaudeAccounts.map((account) => {
      // Backward compatible extraction: prefer individual fields, fallback to claudeAiOauth JSON blob.
      let decryptedClaudeAiOauth = null
      if (account.claudeAiOauth) {
        try {
          const raw = claudeAccountService._decryptSensitiveData(account.claudeAiOauth)
          decryptedClaudeAiOauth = raw ? JSON.parse(raw) : null
        } catch (_) {
          decryptedClaudeAiOauth = null
        }
      }

      const rawScopes =
        account.scopes && account.scopes.trim()
          ? account.scopes
          : decryptedClaudeAiOauth?.scopes
            ? decryptedClaudeAiOauth.scopes.join(' ')
            : ''

      const scopes = rawScopes && rawScopes.trim() ? rawScopes.trim().split(' ') : []
      const isOAuth = scopes.includes('user:profile') && scopes.includes('user:inference')
      const authType = isOAuth ? 'oauth' : 'setup-token'

      const accessToken =
        account.accessToken && String(account.accessToken).trim()
          ? claudeAccountService._decryptSensitiveData(account.accessToken)
          : decryptedClaudeAiOauth?.accessToken || ''

      const refreshToken =
        account.refreshToken && String(account.refreshToken).trim()
          ? claudeAccountService._decryptSensitiveData(account.refreshToken)
          : decryptedClaudeAiOauth?.refreshToken || ''

      let expiresAt = null
      const expiresAtMs = Number.parseInt(account.expiresAt, 10)
      if (Number.isFinite(expiresAtMs) && expiresAtMs > 0) {
        expiresAt = new Date(expiresAtMs).toISOString()
      } else if (decryptedClaudeAiOauth?.expiresAt) {
        try {
          expiresAt = new Date(Number(decryptedClaudeAiOauth.expiresAt)).toISOString()
        } catch (_) {
          expiresAt = null
        }
      }

      const proxy = account.proxy ? normalizeProxy(safeParseJson(account.proxy)) : null

      // 🔧 Parse subscriptionInfo to extract org_uuid and account_uuid
      let orgUuid = null
      let accountUuid = null
      if (account.subscriptionInfo) {
        try {
          const subscriptionInfo = JSON.parse(account.subscriptionInfo)
          orgUuid = subscriptionInfo.organizationUuid || null
          accountUuid = subscriptionInfo.accountUuid || null
        } catch (_) {
          // Ignore parse errors
        }
      }

      // 🔧 Calculate expires_in from expires_at
      let expiresIn = null
      if (expiresAt) {
        try {
          const expiresAtTime = new Date(expiresAt).getTime()
          const nowTime = Date.now()
          const diffSeconds = Math.floor((expiresAtTime - nowTime) / 1000)
          if (diffSeconds > 0) {
            expiresIn = diffSeconds
          }
        } catch (_) {
          // Ignore calculation errors
        }
      }
      // 🔧 Use default expires_in if calculation failed (Anthropic OAuth: 8 hours)
      if (!expiresIn && isOAuth) {
        expiresIn = 28800 // 8 hours
      }

      const credentials = {
        access_token: accessToken,
        refresh_token: refreshToken || undefined,
        expires_at: expiresAt || undefined,
        expires_in: expiresIn || undefined,
        scope: scopes.join(' ') || undefined,
        token_type: 'Bearer'
      }
      // 🔧 Add auth info as top-level credentials fields
      if (orgUuid) {
        credentials.org_uuid = orgUuid
      }
      if (accountUuid) {
        credentials.account_uuid = accountUuid
      }

      // 🔧 Store complete original CRS data in extra
      const extra = {
        crs_account_id: account.id,
        crs_kind: 'claude-account',
        crs_id: account.id,
        crs_name: account.name,
        crs_description: account.description || '',
        crs_platform: account.platform || 'claude',
        crs_auth_type: authType,
        crs_is_active: account.isActive === 'true',
        crs_schedulable: account.schedulable !== 'false',
        crs_priority: Number.parseInt(account.priority, 10) || 50,
        crs_status: account.status || 'active',
        crs_scopes: scopes,
        crs_subscription_info: account.subscriptionInfo || undefined
      }

      return {
        kind: 'claude-account',
        id: account.id,
        name: account.name,
        description: account.description || '',
        platform: account.platform || 'claude',
        authType,
        isActive: account.isActive === 'true',
        schedulable: account.schedulable !== 'false',
        priority: Number.parseInt(account.priority, 10) || 50,
        status: account.status || 'active',
        proxy,
        credentials,
        extra
      }
    })

    // ===== Claude Console API Key accounts =====
    const claudeConsoleSummaries = await claudeConsoleAccountService.getAllAccounts()
    const claudeConsoleAccounts = []
    for (const summary of claudeConsoleSummaries) {
      const full = await claudeConsoleAccountService.getAccount(summary.id)
      if (!full) {
        continue
      }

      const proxy = normalizeProxy(full.proxy)
      const modelMapping = buildModelMappingFromSupportedModels(full.supportedModels)

      const credentials = {
        api_key: full.apiKey,
        base_url: full.apiUrl
      }

      if (modelMapping) {
        credentials.model_mapping = modelMapping
      }

      if (full.userAgent) {
        credentials.user_agent = full.userAgent
      }

      claudeConsoleAccounts.push({
        kind: 'claude-console-account',
        id: full.id,
        name: full.name,
        description: full.description || '',
        platform: full.platform || 'claude-console',
        isActive: full.isActive === true,
        schedulable: full.schedulable !== false,
        priority: Number.parseInt(full.priority, 10) || 50,
        status: full.status || 'active',
        proxy,
        maxConcurrentTasks: Number.parseInt(full.maxConcurrentTasks, 10) || 0,
        credentials,
        extra: {
          crs_account_id: full.id,
          crs_kind: 'claude-console-account',
          crs_id: full.id,
          crs_name: full.name,
          crs_description: full.description || '',
          crs_platform: full.platform || 'claude-console',
          crs_is_active: full.isActive === true,
          crs_schedulable: full.schedulable !== false,
          crs_priority: Number.parseInt(full.priority, 10) || 50,
          crs_status: full.status || 'active'
        }
      })
    }

    // ===== OpenAI OAuth accounts =====
    const openaiOAuthAccounts = []
    {
      const openaiIds = await redis.getAllIdsByIndex(
        'openai:account:index',
        'openai:account:*',
        /^openai:account:(.+)$/
      )
      for (const id of openaiIds) {
        const account = await openaiAccountService.getAccount(id)
        if (!account) {
          continue
        }

        const accessToken = account.accessToken
          ? openaiAccountService.decrypt(account.accessToken)
          : ''
        if (!accessToken) {
          // Skip broken/legacy records without decryptable token
          continue
        }

        const scopes =
          account.scopes && typeof account.scopes === 'string' && account.scopes.trim()
            ? account.scopes.trim().split(' ')
            : []

        const proxy = normalizeProxy(account.proxy)

        // 🔧 Calculate expires_in from expires_at
        let expiresIn = null
        if (account.expiresAt) {
          try {
            const expiresAtTime = new Date(account.expiresAt).getTime()
            const nowTime = Date.now()
            const diffSeconds = Math.floor((expiresAtTime - nowTime) / 1000)
            if (diffSeconds > 0) {
              expiresIn = diffSeconds
            }
          } catch (_) {
            // Ignore calculation errors
          }
        }
        // 🔧 Use default expires_in if calculation failed (OpenAI OAuth: 10 days)
        if (!expiresIn) {
          expiresIn = 864000 // 10 days
        }

        const credentials = {
          access_token: accessToken,
          refresh_token: account.refreshToken || undefined,
          id_token: account.idToken || undefined,
          expires_at: account.expiresAt || undefined,
          expires_in: expiresIn || undefined,
          scope: scopes.join(' ') || undefined,
          token_type: 'Bearer'
        }
        // 🔧 Add auth info as top-level credentials fields
        if (account.accountId) {
          credentials.chatgpt_account_id = account.accountId
        }
        if (account.chatgptUserId) {
          credentials.chatgpt_user_id = account.chatgptUserId
        }
        if (account.organizationId) {
          credentials.organization_id = account.organizationId
        }

        // 🔧 Store complete original CRS data in extra
        const extra = {
          crs_account_id: account.id,
          crs_kind: 'openai-oauth-account',
          crs_id: account.id,
          crs_name: account.name,
          crs_description: account.description || '',
          crs_platform: account.platform || 'openai',
          crs_is_active: account.isActive === 'true',
          crs_schedulable: account.schedulable !== 'false',
          crs_priority: Number.parseInt(account.priority, 10) || 50,
          crs_status: account.status || 'active',
          crs_scopes: scopes,
          crs_email: account.email || undefined,
          crs_chatgpt_account_id: account.accountId || undefined,
          crs_chatgpt_user_id: account.chatgptUserId || undefined,
          crs_organization_id: account.organizationId || undefined
        }

        openaiOAuthAccounts.push({
          kind: 'openai-oauth-account',
          id: account.id,
          name: account.name,
          description: account.description || '',
          platform: account.platform || 'openai',
          authType: 'oauth',
          isActive: account.isActive === 'true',
          schedulable: account.schedulable !== 'false',
          priority: Number.parseInt(account.priority, 10) || 50,
          status: account.status || 'active',
          proxy,
          credentials,
          extra
        })
      }
    }

    // ===== OpenAI Responses API Key accounts =====
    const openaiResponsesAccounts = []
    const openaiResponseIds = await redis.getAllIdsByIndex(
      'openai_responses_account:index',
      'openai_responses_account:*',
      /^openai_responses_account:(.+)$/
    )
    for (const id of openaiResponseIds) {
      const full = await openaiResponsesAccountService.getAccount(id)
      if (!full) {
        continue
      }

      const proxy = normalizeProxy(full.proxy)

      const credentials = {
        api_key: full.apiKey,
        base_url: full.baseApi
      }

      if (full.userAgent) {
        credentials.user_agent = full.userAgent
      }

      openaiResponsesAccounts.push({
        kind: 'openai-responses-account',
        id: full.id,
        name: full.name,
        description: full.description || '',
        platform: full.platform || 'openai-responses',
        isActive: full.isActive === 'true',
        schedulable: full.schedulable !== 'false',
        priority: Number.parseInt(full.priority, 10) || 50,
        status: full.status || 'active',
        proxy,
        credentials,
        extra: {
          crs_account_id: full.id,
          crs_kind: 'openai-responses-account',
          crs_id: full.id,
          crs_name: full.name,
          crs_description: full.description || '',
          crs_platform: full.platform || 'openai-responses',
          crs_is_active: full.isActive === 'true',
          crs_schedulable: full.schedulable !== 'false',
          crs_priority: Number.parseInt(full.priority, 10) || 50,
          crs_status: full.status || 'active'
        }
      })
    }

    return res.json({
      success: true,
      data: {
        exportedAt: new Date().toISOString(),
        claudeAccounts,
        claudeConsoleAccounts,
        openaiOAuthAccounts,
        openaiResponsesAccounts
      }
    })
  } catch (error) {
    logger.error('❌ Failed to export accounts for sync:', error)
    return res.status(500).json({
      success: false,
      error: 'export_failed',
      message: error.message
    })
  }
})

module.exports = router

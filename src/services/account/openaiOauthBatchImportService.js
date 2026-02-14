const fs = require('fs/promises')
const path = require('path')
const openaiAccountService = require('./openaiAccountService')
const logger = require('../../utils/logger')

const DEFAULT_IMPORT_FOLDER_PATH = '/Users/hobee/Downloads/accounts_json'
const MAX_IMPORT_FILE_COUNT = 2000
const MAX_IMPORT_FILE_SIZE = 1024 * 1024

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const JWT_SEGMENT_REGEX = /^[A-Za-z0-9_-]+$/
const TOKEN_REGEX = /^[A-Za-z0-9._~:/+=-]+$/

function normalizeEmail(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().toLowerCase()
}

function normalizeToken(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

function isLikelyJwt(token) {
  const segments = token.split('.')
  if (segments.length !== 3) {
    return false
  }
  return segments.every((segment) => segment.length > 0 && JWT_SEGMENT_REGEX.test(segment))
}

function isTokenBaseFormatValid(token) {
  return (
    typeof token === 'string' &&
    token.length >= 20 &&
    token.length <= 8192 &&
    !/\s/.test(token) &&
    TOKEN_REGEX.test(token)
  )
}

function validateAccessToken(accessToken) {
  if (!isTokenBaseFormatValid(accessToken)) {
    return false
  }
  return isLikelyJwt(accessToken) || accessToken.startsWith('eyJ')
}

function validateRefreshToken(refreshToken) {
  return isTokenBaseFormatValid(refreshToken)
}

function sanitizeFileName(fileName) {
  if (typeof fileName !== 'string' || !fileName.trim()) {
    return ''
  }
  return fileName.replace(/\\/g, '/')
}

function stripBom(content) {
  if (typeof content !== 'string') {
    return ''
  }
  return content.replace(/^\uFEFF/, '')
}

function pickStringValue(containers, keys) {
  for (const container of containers) {
    if (!container || typeof container !== 'object') {
      continue
    }
    for (const key of keys) {
      const value = container[key]
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed) {
          return trimmed
        }
      }
    }
  }
  return ''
}

function extractAccountFields(payload) {
  const root = payload && typeof payload === 'object' ? payload : {}
  const nestedSources = [root, root.openaiOauth, root.oauth, root.tokens, root.oauthTokens]

  return {
    email: normalizeEmail(pickStringValue(nestedSources, ['email'])),
    accessToken: normalizeToken(
      pickStringValue(nestedSources, ['access_token', 'accessToken', 'access token'])
    ),
    refreshToken: normalizeToken(
      pickStringValue(nestedSources, ['refresh_token', 'refreshToken', 'refresh token'])
    )
  }
}

function buildFailureItem(fileName, reason, code, email = '') {
  return {
    fileName: sanitizeFileName(fileName) || 'unknown',
    email,
    code,
    reason
  }
}

function mergeFailure(failures, candidate) {
  const key = `${candidate.fileName}:${candidate.email}:${candidate.code}`
  if (failures.some((item) => `${item.fileName}:${item.email}:${item.code}` === key)) {
    return
  }
  failures.push(candidate)
}

async function validateFolderPath(folderPath) {
  const normalizedPath = path.resolve(String(folderPath || DEFAULT_IMPORT_FOLDER_PATH).trim())
  if (!path.isAbsolute(normalizedPath)) {
    throw new Error('文件夹路径必须为绝对路径')
  }

  const stat = await fs.stat(normalizedPath)
  if (!stat.isDirectory()) {
    throw new Error('提供的路径不是文件夹')
  }

  return normalizedPath
}

async function walkJsonFiles(rootPath, currentPath = rootPath, collected = []) {
  const entries = await fs.readdir(currentPath, { withFileTypes: true })

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name)
    if (entry.isDirectory()) {
      await walkJsonFiles(rootPath, absolutePath, collected)
      continue
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) {
      continue
    }

    const stat = await fs.stat(absolutePath)
    if (stat.size > MAX_IMPORT_FILE_SIZE) {
      throw new Error(`文件过大（>${MAX_IMPORT_FILE_SIZE} bytes）：${absolutePath}`)
    }

    const content = await fs.readFile(absolutePath, 'utf8')
    const relativeFileName = path.relative(rootPath, absolutePath) || entry.name
    collected.push({
      fileName: sanitizeFileName(relativeFileName),
      content
    })

    if (collected.length > MAX_IMPORT_FILE_COUNT) {
      throw new Error(`JSON 文件数量超过限制（${MAX_IMPORT_FILE_COUNT}）`)
    }
  }

  return collected
}

function normalizeUploadedFiles(files = []) {
  if (!Array.isArray(files) || files.length === 0) {
    return []
  }

  return files
    .map((file) => {
      const fileName = sanitizeFileName(file?.fileName || file?.name || '')
      const content = typeof file?.content === 'string' ? file.content : ''
      return { fileName, content }
    })
    .filter((file) => file.fileName && file.fileName.toLowerCase().endsWith('.json'))
}

async function loadImportFiles({ folderPath, files }) {
  if (Array.isArray(files) && files.length > 0) {
    const normalizedFiles = normalizeUploadedFiles(files)
    if (normalizedFiles.length === 0) {
      throw new Error('上传内容中未找到可解析的 JSON 文件')
    }
    if (normalizedFiles.length > MAX_IMPORT_FILE_COUNT) {
      throw new Error(`上传 JSON 文件数量超过限制（${MAX_IMPORT_FILE_COUNT}）`)
    }
    return {
      sourceType: 'uploaded_files',
      sourcePath: '',
      files: normalizedFiles
    }
  }

  const safeFolderPath = await validateFolderPath(folderPath)
  const folderFiles = await walkJsonFiles(safeFolderPath)
  if (folderFiles.length === 0) {
    throw new Error('目标文件夹中未找到 JSON 文件')
  }

  return {
    sourceType: 'folder_path',
    sourcePath: safeFolderPath,
    files: folderFiles
  }
}

function parseImportFiles(files) {
  const validRecords = []
  const failures = []

  files.forEach((file) => {
    const fileName = sanitizeFileName(file.fileName)
    let payload
    try {
      payload = JSON.parse(stripBom(file.content))
    } catch (error) {
      mergeFailure(failures, buildFailureItem(fileName, 'JSON 解析失败', 'INVALID_JSON'))
      return
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      mergeFailure(
        failures,
        buildFailureItem(fileName, 'JSON 顶层结构必须是对象', 'INVALID_JSON_STRUCTURE')
      )
      return
    }

    const extracted = extractAccountFields(payload)

    if (!extracted.email) {
      mergeFailure(
        failures,
        buildFailureItem(fileName, '缺少 email 字段', 'MISSING_EMAIL', extracted.email)
      )
      return
    }

    if (!EMAIL_REGEX.test(extracted.email)) {
      mergeFailure(
        failures,
        buildFailureItem(fileName, 'email 格式无效', 'INVALID_EMAIL', extracted.email)
      )
      return
    }

    if (!extracted.accessToken) {
      mergeFailure(
        failures,
        buildFailureItem(fileName, '缺少 access_token 字段', 'MISSING_ACCESS_TOKEN', extracted.email)
      )
      return
    }

    if (!validateAccessToken(extracted.accessToken)) {
      mergeFailure(
        failures,
        buildFailureItem(
          fileName,
          'access_token 格式无效，应为 JWT 格式且长度合理',
          'INVALID_ACCESS_TOKEN',
          extracted.email
        )
      )
      return
    }

    if (!extracted.refreshToken) {
      mergeFailure(
        failures,
        buildFailureItem(
          fileName,
          '缺少 refresh_token 字段',
          'MISSING_REFRESH_TOKEN',
          extracted.email
        )
      )
      return
    }

    if (!validateRefreshToken(extracted.refreshToken)) {
      mergeFailure(
        failures,
        buildFailureItem(fileName, 'refresh_token 格式无效', 'INVALID_REFRESH_TOKEN', extracted.email)
      )
      return
    }

    validRecords.push({
      fileName,
      ...extracted
    })
  })

  return {
    validRecords,
    failures
  }
}

function detectDuplicateEmails(records, existingEmailSet) {
  const duplicateFailures = []
  const emailMap = new Map()

  records.forEach((record) => {
    const key = normalizeEmail(record.email)
    if (!emailMap.has(key)) {
      emailMap.set(key, [])
    }
    emailMap.get(key).push(record)
  })

  emailMap.forEach((group, email) => {
    if (group.length > 1) {
      group.forEach((record) => {
        mergeFailure(
          duplicateFailures,
          buildFailureItem(
            record.fileName,
            `批量文件中存在重复 email: ${email}`,
            'DUPLICATE_EMAIL_IN_BATCH',
            email
          )
        )
      })
    }
  })

  records.forEach((record) => {
    const normalized = normalizeEmail(record.email)
    if (!existingEmailSet.has(normalized)) {
      return
    }
    mergeFailure(
      duplicateFailures,
      buildFailureItem(
        record.fileName,
        `系统中已存在 email: ${normalized}`,
        'DUPLICATE_EMAIL_IN_SYSTEM',
        normalized
      )
    )
  })

  return duplicateFailures
}

function normalizeImportOptions(options = {}) {
  const rawPriority = Number(options.priority)
  const rawRateLimitDuration = Number(options.rateLimitDuration)
  const accountType = ['shared', 'dedicated'].includes(options.accountType)
    ? options.accountType
    : 'shared'

  return {
    accountType,
    description: typeof options.description === 'string' ? options.description.trim() : '',
    priority: Number.isFinite(rawPriority) ? Math.min(100, Math.max(1, rawPriority)) : 50,
    rateLimitDuration: Number.isFinite(rawRateLimitDuration)
      ? Math.max(0, rawRateLimitDuration)
      : 60,
    proxy: options.proxy || null,
    disableAutoProtection:
      options.disableAutoProtection === true || options.disableAutoProtection === 'true'
  }
}

function buildAccountData(record, options) {
  return {
    name: record.email,
    description: options.description || 'OpenAI OAuth 批量导入',
    accountType: options.accountType,
    priority: options.priority,
    rateLimitDuration: options.rateLimitDuration,
    openaiOauth: {
      idToken: '',
      accessToken: record.accessToken,
      refreshToken: record.refreshToken,
      expires_in: 3600
    },
    accountInfo: {
      accountId: '',
      chatgptUserId: '',
      organizationId: '',
      organizationRole: '',
      organizationTitle: '',
      planType: '',
      email: record.email,
      emailVerified: true
    },
    proxy: options.proxy,
    isActive: true,
    schedulable: true,
    disableAutoProtection: options.disableAutoProtection
  }
}

async function getExistingEmailSet() {
  const existingAccounts = await openaiAccountService.getAllAccounts()
  const emailSet = new Set()
  for (const account of existingAccounts) {
    const email = normalizeEmail(account?.email)
    if (email) {
      emailSet.add(email)
    }
  }
  return emailSet
}

function buildReportBase(source) {
  return {
    sourceType: source.sourceType,
    sourcePath: source.sourcePath,
    summary: {
      totalFiles: source.files.length,
      successCount: 0,
      failedCount: 0
    },
    failures: [],
    importedAccounts: []
  }
}

async function importOpenAIOAuthAccounts(payload = {}) {
  const startedAt = Date.now()
  const source = await loadImportFiles(payload)
  const options = normalizeImportOptions(payload)
  const report = buildReportBase(source)

  const { validRecords, failures: parseFailures } = parseImportFiles(source.files)
  parseFailures.forEach((failure) => mergeFailure(report.failures, failure))

  const existingEmailSet = await getExistingEmailSet()
  const duplicateFailures = detectDuplicateEmails(validRecords, existingEmailSet)
  duplicateFailures.forEach((failure) => mergeFailure(report.failures, failure))

  if (report.failures.length > 0) {
    report.summary.failedCount = report.failures.length
    report.durationMs = Date.now() - startedAt
    return {
      success: false,
      message: '批量导入校验失败，未写入任何账号',
      report
    }
  }

  const accountDataList = validRecords.map((record) => buildAccountData(record, options))
  const createdAccounts = await openaiAccountService.createAccountsAtomic(accountDataList)

  report.summary.successCount = createdAccounts.length
  report.summary.failedCount = 0
  report.importedAccounts = createdAccounts.map((account, index) => ({
    id: account.id,
    name: account.name,
    email: validRecords[index].email,
    fileName: validRecords[index].fileName
  }))
  report.durationMs = Date.now() - startedAt

  logger.info('OpenAI OAuth 批量导入完成', {
    sourceType: report.sourceType,
    totalFiles: report.summary.totalFiles,
    successCount: report.summary.successCount,
    durationMs: report.durationMs
  })

  return {
    success: true,
    message: `批量导入完成，共导入 ${report.summary.successCount} 个账号`,
    report
  }
}

module.exports = {
  DEFAULT_IMPORT_FOLDER_PATH,
  normalizeEmail,
  validateAccessToken,
  validateRefreshToken,
  extractAccountFields,
  parseImportFiles,
  detectDuplicateEmails,
  importOpenAIOAuthAccounts
}

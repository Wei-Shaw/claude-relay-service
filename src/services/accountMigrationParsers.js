/**
 * Account Migration Parsers
 * 负责：格式识别、JSON/ZIP 解析、payload 结构校验。
 * 支持来源：
 *   - CRS 原生        crs-accounts
 *   - sub2api         sub2api-data / sub2api-bundle（legacy 头），以及缺省头但结构匹配
 *   - CLIProxyAPI     单个 auth json，或多 auth json 的 zip
 *
 * 不在这里做字段映射（那是 mappers 的职责），只负责把字节解析成结构化条目并打上 format 标签。
 */

const AdmZip = require('adm-zip')
const logger = require('../utils/logger')

// 对外暴露的格式标识
const FORMAT = {
  CRS: 'crs',
  SUB2API: 'sub2api',
  CLIPROXYAPI_JSON: 'cliproxyapi-json',
  CLIPROXYAPI_ZIP: 'cliproxyapi-zip',
  UNKNOWN: 'unknown'
}

// CRS 原生导出头
const CRS_TYPE = 'crs-accounts'

// sub2api 头（含 legacy）。已核实 account_data.go: dataType / legacyDataType。
const SUB2API_TYPES = new Set(['sub2api-data', 'sub2api-bundle'])

// CLIProxyAPI auth 文件已知 type。已核实各 TokenStorage.type。
const CLIPROXY_TYPES = new Set([
  'claude',
  'codex',
  'gemini',
  'antigravity',
  'vertex',
  'xai',
  'kimi'
])

/**
 * 将前端传来的 base64 内容解码为 Buffer。
 * @param {string} contentBase64
 * @returns {Buffer}
 */
function decodeBase64(contentBase64) {
  if (typeof contentBase64 !== 'string' || contentBase64.length === 0) {
    throw new Error('contentBase64 is required')
  }
  // 容忍 data URL 前缀
  const cleaned = contentBase64.includes(',')
    ? contentBase64.slice(contentBase64.indexOf(',') + 1)
    : contentBase64
  return Buffer.from(cleaned, 'base64')
}

/**
 * 判断 Buffer 是否为 ZIP（PK\x03\x04 本地文件头 / PK\x05\x06 空包）。
 */
function looksLikeZip(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  )
}

/**
 * 从 ZIP Buffer 中提取所有 .json 条目并逐个解析。
 * 忽略目录、非 .json、点文件与 __MACOSX 噪音。
 * @returns {{ authFiles: Array<{filename:string,json:object}>, errors: Array<{name:string,message:string}> }}
 */
function extractJsonEntriesFromZip(buffer) {
  const authFiles = []
  const errors = []
  let zip
  try {
    zip = new AdmZip(buffer)
  } catch (err) {
    return {
      authFiles,
      errors: [{ name: 'zip', message: `invalid zip: ${err.message}` }]
    }
  }
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue
    }
    const base = entry.entryName.split('/').pop() || entry.entryName
    const lower = base.toLowerCase()
    if (
      !lower.endsWith('.json') ||
      base.startsWith('.') ||
      entry.entryName.startsWith('__MACOSX')
    ) {
      continue
    }
    try {
      authFiles.push({ filename: base, json: JSON.parse(entry.getData().toString('utf8')) })
    } catch (err) {
      errors.push({ name: base, message: `invalid json in zip entry: ${err.message}` })
    }
  }
  return { authFiles, errors }
}

/**
 * 从已解析的 JSON 对象判断格式。
 * 注意：CRS 与 sub2api 都可能有 accounts[]，靠 type 头与结构特征区分：
 *   - CRS:     type=crs-accounts；账户条目带 data{}
 *   - sub2api: type in {sub2api-data,sub2api-bundle} 或缺省但顶层有 proxies[]；账户条目带 credentials{}
 *   - CLIProxyAPI 单文件: type in {claude,codex,gemini,antigravity,vertex,xai,kimi}
 * @returns {string} FORMAT.*
 */
function detectFormatFromJson(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return FORMAT.UNKNOWN
  }
  const type = typeof json.type === 'string' ? json.type.trim().toLowerCase() : ''
  if (type === CRS_TYPE) {
    return FORMAT.CRS
  }
  if (SUB2API_TYPES.has(type)) {
    return FORMAT.SUB2API
  }
  if (CLIPROXY_TYPES.has(type)) {
    return FORMAT.CLIPROXYAPI_JSON
  }
  // 缺省头：用结构特征兜底
  if (Array.isArray(json.accounts)) {
    // sub2api 顶层一定有 proxies 数组；CRS 没有
    if (Array.isArray(json.proxies)) {
      return FORMAT.SUB2API
    }
    // CRS 账户条目带 data{}
    if (
      json.accounts.some((a) => a && typeof a === 'object' && a.data && typeof a.data === 'object')
    ) {
      return FORMAT.CRS
    }
    // 有 credentials 的视作 sub2api 无头导出
    if (json.accounts.some((a) => a && typeof a === 'object' && a.credentials)) {
      return FORMAT.SUB2API
    }
  }
  return FORMAT.UNKNOWN
}

/**
 * 顶层解析入口：把上传的 {filename, contentBase64} 解析成结构化结果。
 * 不做字段映射，只负责定格式、拆条目。
 * @param {{ filename?: string, contentBase64: string }} input
 * @returns {{
 *   format: string,
 *   json: object|null,            // 非 zip 时的原始 JSON
 *   authFiles: Array<{filename:string,json:object}>, // cliproxyapi-zip 时的条目
 *   parseErrors: Array<{name:string,message:string}>
 * }}
 */
function parseImportPayload(input) {
  const filename = input && typeof input.filename === 'string' ? input.filename : ''
  const buffer = decodeBase64(input && input.contentBase64)

  // ZIP：只可能是 CLIProxyAPI 多 auth 文件包
  if (looksLikeZip(buffer)) {
    const { authFiles, errors } = extractJsonEntriesFromZip(buffer)
    return {
      format: FORMAT.CLIPROXYAPI_ZIP,
      json: null,
      authFiles,
      parseErrors: errors
    }
  }

  // 普通 JSON
  let json
  try {
    json = JSON.parse(buffer.toString('utf8'))
  } catch (err) {
    logger.warn(
      `⚠️ Account import: failed to parse JSON (${filename || 'unnamed'}): ${err.message}`
    )
    return {
      format: FORMAT.UNKNOWN,
      json: null,
      authFiles: [],
      parseErrors: [{ name: filename || 'file', message: `invalid json: ${err.message}` }]
    }
  }

  return {
    format: detectFormatFromJson(json),
    json,
    authFiles: [],
    parseErrors: []
  }
}

module.exports = {
  FORMAT,
  CRS_TYPE,
  SUB2API_TYPES,
  CLIPROXY_TYPES,
  decodeBase64,
  looksLikeZip,
  extractJsonEntriesFromZip,
  detectFormatFromJson,
  parseImportPayload
}

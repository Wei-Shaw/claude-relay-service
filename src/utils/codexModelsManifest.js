// Codex CLI / VS Code 插件的 /models?client_version=... 响应合成
// 对齐 Codex ModelsResponse（{ models: ModelInfo[] }），模板来自官方 codex_client_models catalog
const crypto = require('crypto')
const path = require('path')

const codexClientModelsTemplate = require(path.join(
  __dirname,
  '../constants/codex_client_models.json'
))

const templateBySlug = new Map()
let defaultTemplate = null

for (const model of codexClientModelsTemplate.models || []) {
  const slug = typeof model?.slug === 'string' ? model.slug.trim() : ''
  if (!slug) {
    continue
  }
  templateBySlug.set(slug, model)
  if (slug === 'gpt-5.5') {
    defaultTemplate = model
  }
}

if (!defaultTemplate) {
  const models = codexClientModelsTemplate.models || []
  defaultTemplate = models.find((model) => model?.visibility === 'list') || models[0] || null
}

const cloneEntry = (entry) => JSON.parse(JSON.stringify(entry))

const codexEntryPriority = (entry) =>
  typeof entry?.priority === 'number' ? entry.priority : 100

// 未命中官方模板时克隆 gpt-5.5 兜底，覆盖 slug/display_name
const buildFallbackEntry = (id) => {
  if (!defaultTemplate) {
    return null
  }
  const entry = cloneEntry(defaultTemplate)
  entry.slug = id
  entry.display_name = id
  entry.description = id
  entry.priority = 99
  entry.availability_nux = null
  entry.upgrade = null
  return entry
}

// 数组（含空数组）原样归一；null/undefined 才回退默认
// 空数组是合法结果（例如黑名单清空后），禁止当成“未传”还原全量
const normalizeModelIds = (modelIds, defaultIds) => {
  if (modelIds == null) {
    return [...defaultIds]
  }
  if (!Array.isArray(modelIds)) {
    return [...defaultIds]
  }

  const seen = new Set()
  const normalized = []
  for (const rawId of modelIds) {
    const id = typeof rawId === 'string' ? rawId.trim() : ''
    if (!id || seen.has(id)) {
      continue
    }
    seen.add(id)
    normalized.push(id)
  }
  return normalized
}

const getDefaultCodexModelIds = () => [...templateBySlug.keys()]

// 合成 Codex ModelsResponse
// modelIds == null → 模板全量；[] → 空目录（不回退）
const buildCodexModelsManifest = (modelIds = null) => {
  const ids = normalizeModelIds(modelIds, getDefaultCodexModelIds())
  const models = []

  for (const id of ids) {
    const template = templateBySlug.get(id)
    const entry = template ? cloneEntry(template) : buildFallbackEntry(id)
    if (!entry) {
      continue
    }
    // Lite 模式会丢掉 hosted 工具声明，对外统一关闭
    if (entry.use_responses_lite === true) {
      entry.use_responses_lite = false
    }
    models.push(entry)
  }

  models.sort((left, right) => codexEntryPriority(left) - codexEntryPriority(right))
  return { models }
}

// OpenAI 兼容列表：必须显式传入 modelIds，不做 Codex 模板默认回退
// [] → 空列表；null/非数组 → 空列表（避免静默暴露错误目录）
const buildOpenAIModelsList = (modelIds) => {
  const ids = normalizeModelIds(Array.isArray(modelIds) ? modelIds : [], [])
  const data = ids.map((id) => {
    const template = templateBySlug.get(id)
    return {
      id,
      object: 'model',
      created: 1735689600,
      owned_by: 'openai',
      type: 'model',
      display_name: template?.display_name || id
    }
  })
  return { object: 'list', data }
}

const codexManifestEtag = (manifest) =>
  `W/"${crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 32)}"`

const codexManifestETagMatches = (ifNoneMatch, etag) => {
  if (!ifNoneMatch || !etag) {
    return false
  }
  const normalize = (value) => {
    const trimmed = String(value).trim()
    return trimmed.length >= 2 && trimmed.slice(0, 2).toUpperCase() === 'W/'
      ? trimmed.slice(2).trim()
      : trimmed
  }
  const want = normalize(etag)
  return String(ifNoneMatch)
    .split(',')
    .some((candidate) => {
      const item = candidate.trim()
      return item === '*' || normalize(item) === want
    })
}

module.exports = {
  buildCodexModelsManifest,
  buildOpenAIModelsList,
  codexManifestEtag,
  codexManifestETagMatches,
  getDefaultCodexModelIds
}

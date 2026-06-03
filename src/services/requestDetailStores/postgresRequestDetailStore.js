const postgres = require('../../models/postgres')

const REQUEST_DETAILS_RESET_SCHEMA_SQL = `
DROP TABLE IF EXISTS request_detail_timings CASCADE;
DROP TABLE IF EXISTS request_detail_contexts CASCADE;
DROP TABLE IF EXISTS request_detail_costs CASCADE;
DROP TABLE IF EXISTS request_detail_payloads CASCADE;
DROP TABLE IF EXISTS request_details CASCADE;
`

const REQUEST_DETAILS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS request_details (
  request_id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  api_key_id TEXT,
  api_key_name TEXT,
  account_id TEXT,
  account_type TEXT,
  model TEXT,
  endpoint TEXT,
  method TEXT,
  status_code INTEGER,
  stream BOOLEAN NOT NULL DEFAULT false,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cache_create_tokens BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens BIGINT NOT NULL DEFAULT 0,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  cost NUMERIC(18,8) NOT NULL DEFAULT 0,
  real_cost NUMERIC(18,8) NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  time_to_first_byte_ms INTEGER,
  time_to_first_token_ms INTEGER,
  content_generation_ms INTEGER,
  error_type TEXT,
  session_id TEXT,
  session_hash TEXT,
  conversation_id TEXT,
  metadata_user_id TEXT,
  user_agent TEXT,
  reasoning_display TEXT,
  has_request_payload BOOLEAN NOT NULL DEFAULT false,
  has_response_payload BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE request_details ADD COLUMN IF NOT EXISTS api_key_name TEXT;
ALTER TABLE request_details ADD COLUMN IF NOT EXISTS error_type TEXT;
ALTER TABLE request_details ADD COLUMN IF NOT EXISTS time_to_first_byte_ms INTEGER;
ALTER TABLE request_details ADD COLUMN IF NOT EXISTS time_to_first_token_ms INTEGER;
ALTER TABLE request_details ADD COLUMN IF NOT EXISTS content_generation_ms INTEGER;
ALTER TABLE request_details ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE request_details ADD COLUMN IF NOT EXISTS session_hash TEXT;
ALTER TABLE request_details ADD COLUMN IF NOT EXISTS conversation_id TEXT;
ALTER TABLE request_details ADD COLUMN IF NOT EXISTS metadata_user_id TEXT;
ALTER TABLE request_details ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE request_details ADD COLUMN IF NOT EXISTS reasoning_display TEXT;
ALTER TABLE request_details ADD COLUMN IF NOT EXISTS has_request_payload BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE request_details ADD COLUMN IF NOT EXISTS has_response_payload BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS request_detail_payloads (
  request_id TEXT PRIMARY KEY REFERENCES request_details(request_id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  request_headers JSONB,
  request_body_snapshot JSONB,
  request_body_size_bytes INTEGER,
  request_body_truncated BOOLEAN NOT NULL DEFAULT false,
  response_headers JSONB,
  response_body_snapshot JSONB,
  response_text_preview TEXT,
  response_body_size_bytes INTEGER,
  response_body_truncated BOOLEAN NOT NULL DEFAULT false,
  upstream_response_id TEXT,
  finish_reason TEXT,
  error_body JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS request_detail_costs (
  request_id TEXT PRIMARY KEY REFERENCES request_details(request_id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  cost_breakdown JSONB,
  real_cost_breakdown JSONB,
  pricing_source TEXT,
  used_fallback_pricing BOOLEAN NOT NULL DEFAULT false,
  cost_recomputed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS request_detail_contexts (
  request_id TEXT PRIMARY KEY REFERENCES request_details(request_id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  prompt_cache_key TEXT,
  service_tier TEXT,
  client_ip TEXT,
  request_source TEXT,
  reasoning_source TEXT,
  is_long_context_request BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_debug JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS request_detail_timings (
  request_id TEXT PRIMARY KEY REFERENCES request_details(request_id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  request_started_at TIMESTAMPTZ,
  first_byte_at TIMESTAMPTZ,
  first_token_at TIMESTAMPTZ,
  response_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_details_timestamp ON request_details (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_details_api_key_timestamp ON request_details (api_key_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_details_account_timestamp ON request_details (account_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_details_model_timestamp ON request_details (model, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_details_endpoint_timestamp ON request_details (endpoint, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_details_status_timestamp ON request_details (status_code, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_details_session_timestamp ON request_details (session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_details_session_hash_timestamp ON request_details (session_hash, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_details_conversation_timestamp ON request_details (conversation_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_details_metadata_user_timestamp ON request_details (metadata_user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_details_reasoning_timestamp ON request_details (reasoning_display, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_request_detail_payloads_timestamp ON request_detail_payloads (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_detail_payloads_upstream_response ON request_detail_payloads (upstream_response_id);
CREATE INDEX IF NOT EXISTS idx_request_detail_payloads_finish_timestamp ON request_detail_payloads (finish_reason, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_detail_payloads_request_body ON request_detail_payloads (timestamp DESC)
  WHERE request_body_snapshot IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_request_detail_payloads_response_body ON request_detail_payloads (timestamp DESC)
  WHERE response_body_snapshot IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_request_detail_costs_timestamp ON request_detail_costs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_detail_costs_pricing_timestamp ON request_detail_costs (pricing_source, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_detail_costs_fallback_timestamp ON request_detail_costs (used_fallback_pricing, timestamp DESC)
  WHERE used_fallback_pricing = true;

CREATE INDEX IF NOT EXISTS idx_request_detail_contexts_timestamp ON request_detail_contexts (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_detail_contexts_prompt_cache_timestamp ON request_detail_contexts (prompt_cache_key, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_detail_contexts_service_tier_timestamp ON request_detail_contexts (service_tier, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_detail_contexts_client_ip_timestamp ON request_detail_contexts (client_ip, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_detail_contexts_source_timestamp ON request_detail_contexts (request_source, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_detail_contexts_long_context_timestamp ON request_detail_contexts (is_long_context_request, timestamp DESC)
  WHERE is_long_context_request = true;

CREATE INDEX IF NOT EXISTS idx_request_detail_timings_timestamp ON request_detail_timings (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_request_detail_timings_first_token ON request_detail_timings (first_token_at DESC)
  WHERE first_token_at IS NOT NULL;
`

const MAIN_COLUMNS = [
  'request_id',
  'timestamp',
  'api_key_id',
  'api_key_name',
  'account_id',
  'account_type',
  'model',
  'endpoint',
  'method',
  'status_code',
  'stream',
  'input_tokens',
  'output_tokens',
  'cache_create_tokens',
  'cache_read_tokens',
  'total_tokens',
  'cost',
  'real_cost',
  'duration_ms',
  'time_to_first_byte_ms',
  'time_to_first_token_ms',
  'content_generation_ms',
  'error_type',
  'session_id',
  'session_hash',
  'conversation_id',
  'metadata_user_id',
  'user_agent',
  'reasoning_display',
  'has_request_payload',
  'has_response_payload'
]

const PAYLOAD_COLUMNS = [
  'request_id',
  'timestamp',
  'request_headers',
  'request_body_snapshot',
  'request_body_size_bytes',
  'request_body_truncated',
  'response_headers',
  'response_body_snapshot',
  'response_text_preview',
  'response_body_size_bytes',
  'response_body_truncated',
  'upstream_response_id',
  'finish_reason',
  'error_body',
  'metadata'
]

const COST_COLUMNS = [
  'request_id',
  'timestamp',
  'cost_breakdown',
  'real_cost_breakdown',
  'pricing_source',
  'used_fallback_pricing',
  'cost_recomputed'
]

const CONTEXT_COLUMNS = [
  'request_id',
  'timestamp',
  'prompt_cache_key',
  'service_tier',
  'client_ip',
  'request_source',
  'reasoning_source',
  'is_long_context_request',
  'metadata',
  'raw_debug'
]

const TIMING_COLUMNS = [
  'request_id',
  'timestamp',
  'request_started_at',
  'first_byte_at',
  'first_token_at',
  'response_completed_at'
]

const OPENAI_RELATED_SQL = `
  (
    account_type IN ('openai', 'openai-responses', 'azure-openai')
    OR COALESCE(endpoint, '') LIKE '/azure/%'
    OR COALESCE(endpoint, '') LIKE '/droid/openai/%'
    OR (
      COALESCE(endpoint, '') LIKE '/openai/%'
      AND COALESCE(endpoint, '') <> '/openai/claude'
      AND COALESCE(endpoint, '') <> '/openai/gemini'
      AND COALESCE(endpoint, '') NOT LIKE '/openai/claude/%'
      AND COALESCE(endpoint, '') NOT LIKE '/openai/gemini/%'
    )
  )
`

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return null
  }

  const normalized = sanitizeStringForPostgres(value).trim()
  return normalized ? normalized : null
}

function sanitizeStringForPostgres(value) {
  let sanitized = ''
  for (const char of String(value)) {
    const codePoint = char.codePointAt(0)
    if (codePoint === 0 || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      continue
    }
    sanitized += char
  }

  return sanitized
}

function sanitizeJsonForPostgres(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return sanitizeStringForPostgres(value)
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  if (seen.has(value)) {
    return '[Circular]'
  }

  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonForPostgres(item, seen))
  }

  const sanitized = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    sanitized[sanitizeStringForPostgres(key)] = sanitizeJsonForPostgres(nestedValue, seen)
  }

  return sanitized
}

function normalizeNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function normalizeInteger(value, fallback = 0) {
  return Math.trunc(normalizeNumber(value, fallback))
}

function normalizeNullableInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const num = Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : null
}

function normalizeDate(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date
}

function toIsoString(value) {
  const date = normalizeDate(value)
  return date ? date.toISOString() : null
}

function jsonValue(value, fallback = null) {
  if (value === undefined) {
    return fallback
  }

  return JSON.stringify(sanitizeJsonForPostgres(value))
}

function getRecordTimestamp(record = {}) {
  return normalizeDate(record.timestamp, new Date())
}

function inferJsonSizeBytes(value) {
  if (value === null || value === undefined) {
    return null
  }

  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  } catch {
    return Buffer.byteLength(String(value), 'utf8')
  }
}

function inferSnapshotTruncated(snapshot, explicitValue) {
  if (explicitValue === true || explicitValue === false) {
    return explicitValue
  }

  return Boolean(
    isPlainObject(snapshot) &&
      (snapshot.summary === 'request body snapshot truncated' ||
        Number.isFinite(Number(snapshot.originalChars)))
  )
}

function buildContextMetadata(record = {}) {
  const metadata = isPlainObject(record.metadata) ? { ...record.metadata } : {}

  if (record.metadata !== undefined && !isPlainObject(record.metadata)) {
    metadata.rawMetadata = record.metadata
  }

  return metadata
}

function buildRawDebug(record = {}) {
  const rawDebug = {}
  for (const key of ['raw', 'debug', 'rawDebug', 'extra']) {
    if (record[key] !== undefined) {
      rawDebug[key] = record[key]
    }
  }

  return Object.keys(rawDebug).length > 0 ? rawDebug : null
}

function getRequestPayload(record = {}) {
  return record.requestBodySnapshot ?? record.requestBody
}

function getResponsePayload(record = {}) {
  return record.responseBodySnapshot ?? record.responseBody
}

function hasRequestPayload(record = {}) {
  return (
    record.requestHeaders !== undefined ||
    getRequestPayload(record) !== undefined ||
    record.requestBodySizeBytes !== undefined ||
    record.requestBodyTruncated !== undefined
  )
}

function hasResponsePayload(record = {}) {
  return (
    record.responseHeaders !== undefined ||
    getResponsePayload(record) !== undefined ||
    record.responseTextPreview !== undefined ||
    record.responseBodySizeBytes !== undefined ||
    record.responseBodyTruncated !== undefined ||
    record.upstreamResponseId !== undefined ||
    record.finishReason !== undefined ||
    record.errorBody !== undefined ||
    record.responseMetadata !== undefined
  )
}

function getMainColumnValue(record, column) {
  switch (column) {
    case 'request_id':
      return normalizeText(record.requestId)
    case 'timestamp':
      return getRecordTimestamp(record)
    case 'api_key_id':
      return normalizeText(record.apiKeyId)
    case 'api_key_name':
      return normalizeText(record.apiKeyName)
    case 'account_id':
      return normalizeText(record.accountId)
    case 'account_type':
      return normalizeText(record.accountType || 'unknown')
    case 'model':
      return normalizeText(record.model || 'unknown')
    case 'endpoint':
      return normalizeText(record.endpoint)
    case 'method':
      return normalizeText(record.method)
    case 'status_code':
      return normalizeNullableInteger(record.statusCode)
    case 'stream':
      return record.stream === true
    case 'input_tokens':
      return normalizeInteger(record.inputTokens)
    case 'output_tokens':
      return normalizeInteger(record.outputTokens)
    case 'cache_create_tokens':
      return normalizeInteger(record.cacheCreateTokens)
    case 'cache_read_tokens':
      return normalizeInteger(record.cacheReadTokens)
    case 'total_tokens':
      return normalizeInteger(record.totalTokens)
    case 'cost':
      return normalizeNumber(record.cost)
    case 'real_cost':
      return normalizeNumber(record.realCost)
    case 'duration_ms':
      return normalizeNullableInteger(record.durationMs)
    case 'time_to_first_byte_ms':
      return normalizeNullableInteger(record.timeToFirstByteMs)
    case 'time_to_first_token_ms':
      return normalizeNullableInteger(record.timeToFirstTokenMs)
    case 'content_generation_ms':
      return normalizeNullableInteger(record.contentGenerationMs)
    case 'error_type':
      return normalizeText(record.errorType)
    case 'session_id':
      return normalizeText(record.sessionId)
    case 'session_hash':
      return normalizeText(record.sessionHash)
    case 'conversation_id':
      return normalizeText(record.conversationId)
    case 'metadata_user_id':
      return normalizeText(record.metadataUserId)
    case 'user_agent':
      return normalizeText(record.userAgent)
    case 'reasoning_display':
      return normalizeText(record.reasoningDisplay)
    case 'has_request_payload':
      return hasRequestPayload(record)
    case 'has_response_payload':
      return hasResponsePayload(record)
    default:
      return null
  }
}

function getPayloadColumnValue(record, column) {
  const requestPayload = getRequestPayload(record)
  const responsePayload = getResponsePayload(record)

  switch (column) {
    case 'request_id':
      return normalizeText(record.requestId)
    case 'timestamp':
      return getRecordTimestamp(record)
    case 'request_headers':
      return jsonValue(record.requestHeaders)
    case 'request_body_snapshot':
      return jsonValue(requestPayload)
    case 'request_body_size_bytes':
      return (
        normalizeNullableInteger(record.requestBodySizeBytes) ?? inferJsonSizeBytes(requestPayload)
      )
    case 'request_body_truncated':
      return inferSnapshotTruncated(requestPayload, record.requestBodyTruncated)
    case 'response_headers':
      return jsonValue(record.responseHeaders)
    case 'response_body_snapshot':
      return jsonValue(responsePayload)
    case 'response_text_preview':
      return normalizeText(record.responseTextPreview)
    case 'response_body_size_bytes':
      return (
        normalizeNullableInteger(record.responseBodySizeBytes) ??
        inferJsonSizeBytes(responsePayload)
      )
    case 'response_body_truncated':
      return inferSnapshotTruncated(responsePayload, record.responseBodyTruncated)
    case 'upstream_response_id':
      return normalizeText(record.upstreamResponseId)
    case 'finish_reason':
      return normalizeText(record.finishReason)
    case 'error_body':
      return jsonValue(record.errorBody)
    case 'metadata':
      return jsonValue(isPlainObject(record.responseMetadata) ? record.responseMetadata : {}, '{}')
    default:
      return null
  }
}

function getCostColumnValue(record, column) {
  switch (column) {
    case 'request_id':
      return normalizeText(record.requestId)
    case 'timestamp':
      return getRecordTimestamp(record)
    case 'cost_breakdown':
      return jsonValue(record.costBreakdown)
    case 'real_cost_breakdown':
      return jsonValue(record.realCostBreakdown)
    case 'pricing_source':
      return normalizeText(record.pricingSource)
    case 'used_fallback_pricing':
      return record.usedFallbackPricing === true
    case 'cost_recomputed':
      return record.costRecomputed === true
    default:
      return null
  }
}

function getContextColumnValue(record, column) {
  switch (column) {
    case 'request_id':
      return normalizeText(record.requestId)
    case 'timestamp':
      return getRecordTimestamp(record)
    case 'prompt_cache_key':
      return normalizeText(record.promptCacheKey)
    case 'service_tier':
      return normalizeText(record.serviceTier)
    case 'client_ip':
      return normalizeText(record.clientIp)
    case 'request_source':
      return normalizeText(record.requestSource)
    case 'reasoning_source':
      return normalizeText(record.reasoningSource)
    case 'is_long_context_request':
      return record.isLongContextRequest === true
    case 'metadata':
      return jsonValue(buildContextMetadata(record), '{}')
    case 'raw_debug':
      return jsonValue(buildRawDebug(record))
    default:
      return null
  }
}

function getTimingColumnValue(record, column) {
  switch (column) {
    case 'request_id':
      return normalizeText(record.requestId)
    case 'timestamp':
      return getRecordTimestamp(record)
    case 'request_started_at':
      return normalizeDate(record.requestStartedAt)
    case 'first_byte_at':
      return normalizeDate(record.firstByteAt)
    case 'first_token_at':
      return normalizeDate(record.firstTokenAt)
    case 'response_completed_at':
      return normalizeDate(record.responseCompletedAt)
    default:
      return null
  }
}

function buildValues(record = {}, columns = [], getter) {
  return columns.map((column) => getter(record, column))
}

function hasTimingData(record = {}) {
  return ['requestStartedAt', 'firstByteAt', 'firstTokenAt', 'responseCompletedAt'].some(
    (key) => record[key] !== undefined && record[key] !== null
  )
}

function buildUpsertSql(tableName, columns) {
  const assignments = columns
    .filter((column) => column !== 'request_id')
    .map((column) => `${column} = EXCLUDED.${column}`)
    .concat('updated_at = now()')
    .join(', ')

  return (recordCount) => {
    const placeholders = Array.from({ length: recordCount }, (_, recordIndex) => {
      const start = recordIndex * columns.length
      return `(${columns.map((_column, columnIndex) => `$${start + columnIndex + 1}`).join(', ')})`
    })

    return `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (request_id) DO UPDATE SET ${assignments}
    `
  }
}

const buildMainUpsertSql = buildUpsertSql('request_details', MAIN_COLUMNS)
const buildPayloadUpsertSql = buildUpsertSql('request_detail_payloads', PAYLOAD_COLUMNS)
const buildCostUpsertSql = buildUpsertSql('request_detail_costs', COST_COLUMNS)
const buildContextUpsertSql = buildUpsertSql('request_detail_contexts', CONTEXT_COLUMNS)
const buildTimingUpsertSql = buildUpsertSql('request_detail_timings', TIMING_COLUMNS)

async function upsertRows(records, columns, getter, buildSql) {
  if (records.length === 0) {
    return
  }

  const values = []
  for (const record of records) {
    values.push(...buildValues(record, columns, getter))
  }

  await postgres.query(buildSql(records.length), values)
}

function normalizeSortOrder(sortOrder) {
  return sortOrder === 'asc' ? 'ASC' : 'DESC'
}

const REQUEST_DETAIL_SORT_COLUMNS = {
  timestamp: 'd.timestamp',
  inputTokens: 'd.input_tokens',
  outputTokens: 'd.output_tokens',
  cacheReadTokens: 'd.cache_read_tokens',
  cacheCreateTokens: 'd.cache_create_tokens',
  totalTokens: 'd.total_tokens',
  cost: 'd.cost',
  durationMs: 'COALESCE(d.duration_ms, 0)',
  timeToFirstByteMs: 'COALESCE(d.time_to_first_byte_ms, 0)',
  timeToFirstTokenMs: 'COALESCE(d.time_to_first_token_ms, 0)',
  contentGenerationMs: 'COALESCE(d.content_generation_ms, 0)'
}

function normalizeSortBy(sortBy) {
  return REQUEST_DETAIL_SORT_COLUMNS[sortBy] ? sortBy : 'timestamp'
}

function buildRequestDetailOrderBy(sortBy = 'timestamp', sortOrder = 'desc') {
  const normalizedSortBy = normalizeSortBy(sortBy)
  const column = REQUEST_DETAIL_SORT_COLUMNS[normalizedSortBy]
  const order = normalizeSortOrder(sortOrder)

  if (normalizedSortBy === 'timestamp') {
    return `d.timestamp ${order}, d.request_id ${order}`
  }

  return `${column} ${order}, d.timestamp ${order}, d.request_id ${order}`
}

function createBoundedTextSearch(value) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  return `%${normalized.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

function buildListWhereClause({ startDate, endDate, filters = {} } = {}) {
  const start = normalizeDate(startDate)
  const end = normalizeDate(endDate)
  if (!start || !end) {
    return null
  }

  const clauses = ['d.timestamp >= $1', 'd.timestamp <= $2']
  const values = [start, end]
  const addValue = (value) => {
    values.push(value)
    return `$${values.length}`
  }

  const filterColumns = [
    ['apiKeyId', 'd.api_key_id'],
    ['accountId', 'd.account_id'],
    ['model', 'd.model'],
    ['endpoint', 'd.endpoint']
  ]

  for (const [filterKey, column] of filterColumns) {
    const value = normalizeText(filters[filterKey])
    if (value) {
      clauses.push(`${column} = ${addValue(value)}`)
    }
  }

  const session = normalizeText(filters.session)
  if (session) {
    const placeholder = addValue(session)
    clauses.push(
      [
        `(d.session_id = ${placeholder}`,
        `d.session_hash = ${placeholder}`,
        `d.conversation_id = ${placeholder}`,
        `d.metadata_user_id = ${placeholder})`
      ].join(' OR ')
    )
  }

  const keyword = createBoundedTextSearch(filters.keyword)
  if (keyword) {
    const placeholder = addValue(keyword)
    clauses.push(`(
      d.request_id ILIKE ${placeholder} ESCAPE '\\'
      OR d.api_key_id ILIKE ${placeholder} ESCAPE '\\'
      OR d.api_key_name ILIKE ${placeholder} ESCAPE '\\'
      OR d.account_id ILIKE ${placeholder} ESCAPE '\\'
      OR d.account_type ILIKE ${placeholder} ESCAPE '\\'
      OR d.model ILIKE ${placeholder} ESCAPE '\\'
      OR d.endpoint ILIKE ${placeholder} ESCAPE '\\'
      OR d.method ILIKE ${placeholder} ESCAPE '\\'
      OR d.session_id ILIKE ${placeholder} ESCAPE '\\'
      OR d.session_hash ILIKE ${placeholder} ESCAPE '\\'
      OR d.conversation_id ILIKE ${placeholder} ESCAPE '\\'
      OR d.metadata_user_id ILIKE ${placeholder} ESCAPE '\\'
      OR d.user_agent ILIKE ${placeholder} ESCAPE '\\'
      OR d.reasoning_display ILIKE ${placeholder} ESCAPE '\\'
      OR EXISTS (
        SELECT 1
        FROM request_detail_contexts c
        WHERE c.request_id = d.request_id
          AND (
            c.prompt_cache_key ILIKE ${placeholder} ESCAPE '\\'
            OR c.service_tier ILIKE ${placeholder} ESCAPE '\\'
            OR c.client_ip ILIKE ${placeholder} ESCAPE '\\'
            OR c.request_source ILIKE ${placeholder} ESCAPE '\\'
            OR c.reasoning_source ILIKE ${placeholder} ESCAPE '\\'
          )
      )
    )`)
  }

  return {
    whereSql: clauses.join(' AND '),
    values
  }
}

function rowToRecord(row = {}) {
  const metadata = isPlainObject(row.context_metadata) ? row.context_metadata : {}
  const record = {
    requestId: row.request_id,
    timestamp: toIsoString(row.timestamp),
    requestStartedAt: toIsoString(row.timing_request_started_at),
    apiKeyId: row.api_key_id || null,
    apiKeyName: row.api_key_name || null,
    accountId: row.account_id || null,
    accountType: row.account_type || 'unknown',
    model: row.model || 'unknown',
    endpoint: row.endpoint || null,
    method: row.method || null,
    statusCode: normalizeInteger(row.status_code),
    stream: row.stream === true,
    inputTokens: normalizeInteger(row.input_tokens),
    outputTokens: normalizeInteger(row.output_tokens),
    cacheCreateTokens: normalizeInteger(row.cache_create_tokens),
    cacheReadTokens: normalizeInteger(row.cache_read_tokens),
    totalTokens: normalizeInteger(row.total_tokens),
    cost: normalizeNumber(row.cost),
    realCost: normalizeNumber(row.real_cost),
    durationMs: normalizeInteger(row.duration_ms),
    timeToFirstByteMs: normalizeNullableInteger(row.time_to_first_byte_ms),
    timeToFirstTokenMs: normalizeNullableInteger(row.time_to_first_token_ms),
    contentGenerationMs: normalizeNullableInteger(row.content_generation_ms),
    errorType: row.error_type || null,
    metadata,
    firstByteAt: toIsoString(row.timing_first_byte_at),
    firstTokenAt: toIsoString(row.timing_first_token_at),
    responseCompletedAt: toIsoString(row.timing_response_completed_at),
    sessionId: row.session_id || null,
    sessionHash: row.session_hash || null,
    conversationId: row.conversation_id || null,
    promptCacheKey: row.context_prompt_cache_key || null,
    metadataUserId: row.metadata_user_id || null,
    serviceTier: row.context_service_tier || null,
    clientIp: row.context_client_ip || null,
    userAgent: row.user_agent || null,
    requestSource: row.context_request_source || null,
    costBreakdown: row.cost_breakdown || null,
    realCostBreakdown: row.real_cost_breakdown || null,
    pricingSource: row.pricing_source || null,
    usedFallbackPricing: row.used_fallback_pricing === true,
    costRecomputed: row.cost_recomputed === true,
    isLongContextRequest: row.context_is_long_context_request === true,
    reasoningDisplay: row.reasoning_display || null,
    reasoningSource: row.context_reasoning_source || null,
    hasRequestPayload: row.has_request_payload === true,
    hasResponsePayload: row.has_response_payload === true
  }

  if (row.payload_request_headers !== undefined && row.payload_request_headers !== null) {
    record.requestHeaders = row.payload_request_headers
  }
  if (
    row.payload_request_body_snapshot !== undefined &&
    row.payload_request_body_snapshot !== null
  ) {
    record.requestBodySnapshot = row.payload_request_body_snapshot
  }
  if (row.payload_request_body_size_bytes !== undefined) {
    record.requestBodySizeBytes = normalizeNullableInteger(row.payload_request_body_size_bytes)
  }
  if (row.payload_request_body_truncated !== undefined) {
    record.requestBodyTruncated = row.payload_request_body_truncated === true
  }
  if (row.payload_response_headers !== undefined && row.payload_response_headers !== null) {
    record.responseHeaders = row.payload_response_headers
  }
  if (
    row.payload_response_body_snapshot !== undefined &&
    row.payload_response_body_snapshot !== null
  ) {
    record.responseBodySnapshot = row.payload_response_body_snapshot
  }
  if (
    row.payload_response_text_preview !== undefined &&
    row.payload_response_text_preview !== null
  ) {
    record.responseTextPreview = row.payload_response_text_preview
  }
  if (row.payload_response_body_size_bytes !== undefined) {
    record.responseBodySizeBytes = normalizeNullableInteger(row.payload_response_body_size_bytes)
  }
  if (row.payload_response_body_truncated !== undefined) {
    record.responseBodyTruncated = row.payload_response_body_truncated === true
  }
  if (row.payload_upstream_response_id !== undefined && row.payload_upstream_response_id !== null) {
    record.upstreamResponseId = row.payload_upstream_response_id
  }
  if (row.payload_finish_reason !== undefined && row.payload_finish_reason !== null) {
    record.finishReason = row.payload_finish_reason
  }
  if (row.payload_error_body !== undefined && row.payload_error_body !== null) {
    record.errorBody = row.payload_error_body
  }
  if (row.payload_metadata !== undefined && row.payload_metadata !== null) {
    record.responseMetadata = row.payload_metadata
  }
  if (row.context_raw_debug !== undefined && row.context_raw_debug !== null) {
    record.rawDebug = row.context_raw_debug
  }

  return record
}

function rowToSessionSummary(row = {}) {
  return {
    sessionKey: row.session_key || null,
    sessionId: row.session_id || null,
    sessionHash: row.session_hash || null,
    conversationId: row.conversation_id || null,
    metadataUserId: row.metadata_user_id || null,
    firstTimestamp: toIsoString(row.first_timestamp),
    latestTimestamp: toIsoString(row.latest_timestamp),
    requestCount: normalizeInteger(row.request_count),
    apiKeyIds: Array.isArray(row.api_key_ids) ? row.api_key_ids.filter(Boolean) : [],
    accountIds: Array.isArray(row.account_ids) ? row.account_ids.filter(Boolean) : [],
    accountTypes: Array.isArray(row.account_types) ? row.account_types.filter(Boolean) : [],
    models: Array.isArray(row.models) ? row.models.filter(Boolean) : [],
    inputTokens: normalizeNumber(row.input_tokens),
    outputTokens: normalizeNumber(row.output_tokens),
    cacheReadTokens: normalizeNumber(row.cache_read_tokens),
    cacheCreateTokens: normalizeNumber(row.cache_create_tokens),
    totalTokens: normalizeNumber(row.total_tokens),
    totalCost: normalizeNumber(row.total_cost, 6),
    avgDurationMs: normalizeNullableInteger(row.avg_duration_ms),
    avgTimeToFirstTokenMs: normalizeNullableInteger(row.avg_time_to_first_token_ms),
    p95TimeToFirstTokenMs: normalizeNullableInteger(row.p95_time_to_first_token_ms),
    avgContentGenerationMs: normalizeNullableInteger(row.avg_content_generation_ms),
    p95ContentGenerationMs: normalizeNullableInteger(row.p95_content_generation_ms)
  }
}

async function ensureSchema() {
  await postgres.query(REQUEST_DETAILS_SCHEMA_SQL)
}

async function resetSchema() {
  await postgres.query(REQUEST_DETAILS_RESET_SCHEMA_SQL)
  await ensureSchema()
}

async function upsertRequestDetails(records = []) {
  const validRecords = records.filter((record) => normalizeText(record?.requestId))
  if (validRecords.length === 0) {
    return { upserted: 0 }
  }

  await upsertRows(validRecords, MAIN_COLUMNS, getMainColumnValue, buildMainUpsertSql)

  const payloadRecords = validRecords.filter(
    (record) => hasRequestPayload(record) || hasResponsePayload(record)
  )
  await upsertRows(payloadRecords, PAYLOAD_COLUMNS, getPayloadColumnValue, buildPayloadUpsertSql)
  await upsertRows(validRecords, COST_COLUMNS, getCostColumnValue, buildCostUpsertSql)
  await upsertRows(validRecords, CONTEXT_COLUMNS, getContextColumnValue, buildContextUpsertSql)
  await upsertRows(
    validRecords.filter((record) => hasTimingData(record)),
    TIMING_COLUMNS,
    getTimingColumnValue,
    buildTimingUpsertSql
  )

  return { upserted: validRecords.length }
}

async function upsertRequestDetail(record = {}) {
  return upsertRequestDetails([record])
}

async function listRecordsInRange({ startDate, endDate, sortOrder = 'desc' } = {}) {
  const start = normalizeDate(startDate)
  const end = normalizeDate(endDate)
  if (!start || !end) {
    return []
  }

  const order = sortOrder === 'asc' ? 'ASC' : 'DESC'
  const result = await postgres.query(
    `
      SELECT d.*
      FROM request_details d
      WHERE d.timestamp >= $1 AND d.timestamp <= $2
      ORDER BY d.timestamp ${order}, d.request_id ${order}
    `,
    [start, end]
  )

  return result.rows.map(rowToRecord)
}

async function listRecordsPage({
  startDate,
  endDate,
  filters = {},
  sortBy = 'timestamp',
  sortOrder = 'desc',
  page = 1,
  pageSize = 50
} = {}) {
  const where = buildListWhereClause({ startDate, endDate, filters })
  if (!where) {
    return []
  }

  const currentPage = Math.max(normalizeInteger(page, 1), 1)
  const limit = Math.min(Math.max(normalizeInteger(pageSize, 50), 1), 200)
  const offset = (currentPage - 1) * limit
  const orderBy = buildRequestDetailOrderBy(sortBy, sortOrder)
  const values = [...where.values, limit, offset]

  const result = await postgres.query(
    `
      SELECT d.*
      FROM request_details d
      WHERE ${where.whereSql}
      ORDER BY ${orderBy}
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `,
    values
  )

  return result.rows.map(rowToRecord)
}

async function listSessionSummaries({
  startDate,
  endDate,
  filters = {},
  sortOrder = 'desc',
  page = 1,
  pageSize = 50
} = {}) {
  const where = buildListWhereClause({ startDate, endDate, filters })
  if (!where) {
    return {
      sessions: [],
      totalSessions: 0
    }
  }

  const currentPage = Math.max(normalizeInteger(page, 1), 1)
  const limit = Math.min(Math.max(normalizeInteger(pageSize, 50), 1), 200)
  const offset = (currentPage - 1) * limit
  const order = normalizeSortOrder(sortOrder)
  const values = [...where.values, limit, offset]

  const result = await postgres.query(
    `
      WITH filtered AS (
        SELECT
          d.*,
          COALESCE(
            NULLIF(d.session_id, ''),
            NULLIF(d.conversation_id, ''),
            NULLIF(d.session_hash, ''),
            NULLIF(d.metadata_user_id, '')
          ) AS session_key
        FROM request_details d
        WHERE ${where.whereSql}
      ),
      grouped AS (
        SELECT
          session_key,
          MAX(session_id) FILTER (WHERE session_id IS NOT NULL AND session_id <> '') AS session_id,
          MAX(session_hash) FILTER (WHERE session_hash IS NOT NULL AND session_hash <> '') AS session_hash,
          MAX(conversation_id) FILTER (WHERE conversation_id IS NOT NULL AND conversation_id <> '') AS conversation_id,
          MAX(metadata_user_id) FILTER (WHERE metadata_user_id IS NOT NULL AND metadata_user_id <> '') AS metadata_user_id,
          MIN(timestamp) AS first_timestamp,
          MAX(timestamp) AS latest_timestamp,
          COUNT(*)::int AS request_count,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT api_key_id), NULL) AS api_key_ids,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT account_id), NULL) AS account_ids,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT account_type), NULL) AS account_types,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT model), NULL) AS models,
          COALESCE(SUM(input_tokens), 0)::float8 AS input_tokens,
          COALESCE(SUM(output_tokens), 0)::float8 AS output_tokens,
          COALESCE(SUM(cache_read_tokens), 0)::float8 AS cache_read_tokens,
          COALESCE(SUM(cache_create_tokens), 0)::float8 AS cache_create_tokens,
          COALESCE(SUM(total_tokens), 0)::float8 AS total_tokens,
          COALESCE(SUM(cost), 0)::float8 AS total_cost,
          ROUND(AVG(duration_ms))::int AS avg_duration_ms,
          ROUND(AVG(time_to_first_token_ms))::int AS avg_time_to_first_token_ms,
          ROUND(
            COALESCE(
              PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY time_to_first_token_ms)
                FILTER (WHERE time_to_first_token_ms IS NOT NULL),
              0
            )::numeric
          )::int AS p95_time_to_first_token_ms,
          ROUND(AVG(content_generation_ms))::int AS avg_content_generation_ms,
          ROUND(
            COALESCE(
              PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY content_generation_ms)
                FILTER (WHERE content_generation_ms IS NOT NULL),
              0
            )::numeric
          )::int AS p95_content_generation_ms
        FROM filtered
        WHERE session_key IS NOT NULL
        GROUP BY session_key
      )
      SELECT *, COUNT(*) OVER()::int AS total_sessions
      FROM grouped
      ORDER BY latest_timestamp ${order}, session_key ${order}
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
    `,
    values
  )

  return {
    sessions: result.rows.map(rowToSessionSummary),
    totalSessions: normalizeInteger(result.rows[0]?.total_sessions)
  }
}

async function getListSummary({ startDate, endDate, filters = {} } = {}) {
  const where = buildListWhereClause({ startDate, endDate, filters })
  if (!where) {
    return {
      totalRequests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
      totalCost: 0,
      avgDurationMs: 0,
      cacheHitRate: 0,
      cacheHitNumerator: 0,
      cacheHitDenominator: 0,
      cacheHitFormula: 'cacheReadTokens / (inputTokens + cacheReadTokens + cacheCreateTokens)',
      cacheCreateNotApplicable: false
    }
  }

  const result = await postgres.query(
    `
      SELECT
        COUNT(*)::int AS total_requests,
        COALESCE(SUM(d.input_tokens), 0)::float8 AS input_tokens,
        COALESCE(SUM(d.output_tokens), 0)::float8 AS output_tokens,
        COALESCE(SUM(d.cache_read_tokens), 0)::float8 AS cache_read_tokens,
        COALESCE(SUM(CASE WHEN ${OPENAI_RELATED_SQL} THEN 0 ELSE d.cache_create_tokens END), 0)::float8
          AS cache_create_tokens,
        COALESCE(SUM(d.cost), 0)::float8 AS total_cost,
        COALESCE(ROUND(AVG(d.duration_ms)), 0)::int AS avg_duration_ms,
        COALESCE(SUM(d.cache_read_tokens), 0)::float8 AS cache_hit_numerator,
        COALESCE(SUM(d.input_tokens + d.cache_read_tokens + d.cache_create_tokens), 0)::float8
          AS cache_hit_denominator,
        COALESCE(SUM(CASE WHEN ${OPENAI_RELATED_SQL} THEN 1 ELSE 0 END), 0)::int
          AS openai_related_requests
      FROM request_details d
      WHERE ${where.whereSql}
    `,
    where.values
  )

  const row = result.rows[0] || {}
  const totalRequests = normalizeInteger(row.total_requests)
  const cacheHitNumerator = normalizeNumber(row.cache_hit_numerator)
  const cacheHitDenominator = normalizeNumber(row.cache_hit_denominator)

  return {
    totalRequests,
    inputTokens: normalizeNumber(row.input_tokens),
    outputTokens: normalizeNumber(row.output_tokens),
    cacheReadTokens: normalizeNumber(row.cache_read_tokens),
    cacheCreateTokens: normalizeNumber(row.cache_create_tokens),
    totalCost: normalizeNumber(row.total_cost, 6),
    avgDurationMs: normalizeInteger(row.avg_duration_ms),
    cacheHitRate:
      cacheHitDenominator > 0
        ? normalizeNumber((cacheHitNumerator / cacheHitDenominator) * 100, 2)
        : 0,
    cacheHitNumerator,
    cacheHitDenominator,
    cacheHitFormula: 'cacheReadTokens / (inputTokens + cacheReadTokens + cacheCreateTokens)',
    cacheCreateNotApplicable:
      totalRequests > 0 && normalizeInteger(row.openai_related_requests) === totalRequests
  }
}

async function getAvailableFilters({ startDate, endDate } = {}) {
  const start = normalizeDate(startDate)
  const end = normalizeDate(endDate)
  if (!start || !end) {
    return {
      apiKeys: [],
      accounts: [],
      models: [],
      endpoints: [],
      dateRange: {
        earliest: null,
        latest: null
      }
    }
  }

  const values = [start, end]
  const rangeWhere = 'd.timestamp >= $1 AND d.timestamp <= $2'
  const [apiKeysResult, accountsResult, modelsResult, endpointsResult, dateRangeResult] =
    await Promise.all([
      postgres.query(
        `
          SELECT d.api_key_id, MAX(d.api_key_name) AS api_key_name
          FROM request_details d
          WHERE ${rangeWhere} AND d.api_key_id IS NOT NULL
          GROUP BY d.api_key_id
          ORDER BY COALESCE(MAX(d.api_key_name), d.api_key_id), d.api_key_id
        `,
        values
      ),
      postgres.query(
        `
          SELECT d.account_id, MAX(d.account_type) AS account_type
          FROM request_details d
          WHERE ${rangeWhere} AND d.account_id IS NOT NULL
          GROUP BY d.account_id
          ORDER BY d.account_id
        `,
        values
      ),
      postgres.query(
        `
          SELECT DISTINCT d.model
          FROM request_details d
          WHERE ${rangeWhere} AND d.model IS NOT NULL
          ORDER BY d.model
        `,
        values
      ),
      postgres.query(
        `
          SELECT DISTINCT d.endpoint
          FROM request_details d
          WHERE ${rangeWhere} AND d.endpoint IS NOT NULL
          ORDER BY d.endpoint
        `,
        values
      ),
      postgres.query(
        `
          SELECT MIN(d.timestamp) AS earliest, MAX(d.timestamp) AS latest
          FROM request_details d
          WHERE ${rangeWhere}
        `,
        values
      )
    ])

  const dateRange = dateRangeResult.rows[0] || {}

  return {
    apiKeys: apiKeysResult.rows.map((row) => ({
      id: row.api_key_id,
      name: row.api_key_name || row.api_key_id
    })),
    accounts: accountsResult.rows.map((row) => ({
      id: row.account_id,
      name: row.account_id,
      accountType: row.account_type || 'unknown'
    })),
    models: modelsResult.rows.map((row) => row.model),
    endpoints: endpointsResult.rows.map((row) => row.endpoint),
    dateRange: {
      earliest: toIsoString(dateRange.earliest),
      latest: toIsoString(dateRange.latest)
    }
  }
}

async function getRequestDetail(requestId) {
  const normalizedRequestId = normalizeText(requestId)
  if (!normalizedRequestId) {
    return null
  }

  const result = await postgres.query(
    `
      SELECT
        d.*,
        p.request_headers AS payload_request_headers,
        p.request_body_snapshot AS payload_request_body_snapshot,
        p.request_body_size_bytes AS payload_request_body_size_bytes,
        p.request_body_truncated AS payload_request_body_truncated,
        p.response_headers AS payload_response_headers,
        p.response_body_snapshot AS payload_response_body_snapshot,
        p.response_text_preview AS payload_response_text_preview,
        p.response_body_size_bytes AS payload_response_body_size_bytes,
        p.response_body_truncated AS payload_response_body_truncated,
        p.upstream_response_id AS payload_upstream_response_id,
        p.finish_reason AS payload_finish_reason,
        p.error_body AS payload_error_body,
        p.metadata AS payload_metadata,
        c.cost_breakdown,
        c.real_cost_breakdown,
        c.pricing_source,
        c.used_fallback_pricing,
        c.cost_recomputed,
        x.prompt_cache_key AS context_prompt_cache_key,
        x.service_tier AS context_service_tier,
        x.client_ip AS context_client_ip,
        x.request_source AS context_request_source,
        x.reasoning_source AS context_reasoning_source,
        x.is_long_context_request AS context_is_long_context_request,
        x.metadata AS context_metadata,
        x.raw_debug AS context_raw_debug,
        t.request_started_at AS timing_request_started_at,
        t.first_byte_at AS timing_first_byte_at,
        t.first_token_at AS timing_first_token_at,
        t.response_completed_at AS timing_response_completed_at
      FROM request_details d
      LEFT JOIN request_detail_payloads p ON p.request_id = d.request_id
      LEFT JOIN request_detail_costs c ON c.request_id = d.request_id
      LEFT JOIN request_detail_contexts x ON x.request_id = d.request_id
      LEFT JOIN request_detail_timings t ON t.request_id = d.request_id
      WHERE d.request_id = $1
      LIMIT 1
    `,
    [normalizedRequestId]
  )

  return result.rows[0] ? rowToRecord(result.rows[0]) : null
}

async function countRequestBodySnapshots() {
  const result = await postgres.query(
    `
      SELECT COUNT(*)::int AS snapshot_count
      FROM request_detail_payloads
      WHERE request_body_snapshot IS NOT NULL
    `
  )

  return Number(result.rows[0]?.snapshot_count || 0)
}

async function purgeRequestBodySnapshots() {
  const result = await postgres.query(
    `
      UPDATE request_detail_payloads
      SET request_body_snapshot = NULL,
          request_body_size_bytes = NULL,
          request_body_truncated = false,
          updated_at = now()
      WHERE request_body_snapshot IS NOT NULL
    `
  )

  await postgres.query(`
    UPDATE request_details d
    SET has_request_payload = EXISTS (
          SELECT 1
          FROM request_detail_payloads p
          WHERE p.request_id = d.request_id
            AND p.request_headers IS NOT NULL
        ),
        updated_at = now()
    WHERE d.has_request_payload = true
  `)

  return { updatedRecords: result.rowCount || 0 }
}

module.exports = {
  REQUEST_DETAILS_SCHEMA_SQL,
  REQUEST_DETAILS_RESET_SCHEMA_SQL,
  ensureSchema,
  resetSchema,
  upsertRequestDetail,
  upsertRequestDetails,
  listRecordsInRange,
  listRecordsPage,
  listSessionSummaries,
  getListSummary,
  getAvailableFilters,
  getRequestDetail,
  countRequestBodySnapshots,
  purgeRequestBodySnapshots,
  rowToRecord
}

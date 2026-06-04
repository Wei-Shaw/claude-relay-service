const { v4: uuidv4 } = require('uuid')
const postgres = require('../../models/postgres')
const config = require('../../../config/config')

const USAGE_RESET_SCHEMA_SQL = `
DROP TABLE IF EXISTS usage_backfill_runs CASCADE;
DROP TABLE IF EXISTS usage_rollups CASCADE;
DROP TABLE IF EXISTS usage_events CASCADE;
`

const USAGE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS usage_events (
  event_id TEXT PRIMARY KEY,
  request_id TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  api_key_id TEXT NOT NULL,
  api_key_name TEXT,
  account_id TEXT,
  account_type TEXT,
  model TEXT NOT NULL DEFAULT 'unknown',
  normalized_model TEXT NOT NULL DEFAULT 'unknown',
  endpoint TEXT,
  method TEXT,
  status_code INTEGER,
  stream BOOLEAN NOT NULL DEFAULT false,
  duration_ms INTEGER,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cache_create_tokens BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens BIGINT NOT NULL DEFAULT 0,
  ephemeral_5m_tokens BIGINT NOT NULL DEFAULT 0,
  ephemeral_1h_tokens BIGINT NOT NULL DEFAULT 0,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  cost NUMERIC(18,8) NOT NULL DEFAULT 0,
  real_cost NUMERIC(18,8) NOT NULL DEFAULT 0,
  cost_breakdown JSONB,
  real_cost_breakdown JSONB,
  pricing_source TEXT,
  used_fallback_pricing BOOLEAN NOT NULL DEFAULT false,
  is_long_context_request BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_events_request_id
  ON usage_events (request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usage_events_api_key_timestamp
  ON usage_events (api_key_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_model_timestamp
  ON usage_events (normalized_model, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_account_timestamp
  ON usage_events (account_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_timestamp
  ON usage_events (timestamp DESC);

CREATE TABLE IF NOT EXISTS usage_rollups (
  source_type TEXT NOT NULL DEFAULT 'event',
  period_type TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  dimension_type TEXT NOT NULL,
  api_key_id TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  request_count BIGINT NOT NULL DEFAULT 0,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cache_create_tokens BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens BIGINT NOT NULL DEFAULT 0,
  ephemeral_5m_tokens BIGINT NOT NULL DEFAULT 0,
  ephemeral_1h_tokens BIGINT NOT NULL DEFAULT 0,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  cost NUMERIC(18,8) NOT NULL DEFAULT 0,
  real_cost NUMERIC(18,8) NOT NULL DEFAULT 0,
  long_context_requests BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_type, period_type, period_start, dimension_type, api_key_id, model)
);

ALTER TABLE usage_rollups
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'event';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'usage_rollups'::regclass
      AND conname = 'usage_rollups_pkey'
  ) THEN
    ALTER TABLE usage_rollups DROP CONSTRAINT usage_rollups_pkey;
  END IF;

  ALTER TABLE usage_rollups
    ADD CONSTRAINT usage_rollups_pkey
    PRIMARY KEY (source_type, period_type, period_start, dimension_type, api_key_id, model);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_usage_rollups_period_dimension
  ON usage_rollups (period_type, period_start DESC, dimension_type);
CREATE INDEX IF NOT EXISTS idx_usage_rollups_api_key_period
  ON usage_rollups (api_key_id, period_type, period_start DESC)
  WHERE api_key_id <> '';
CREATE INDEX IF NOT EXISTS idx_usage_rollups_model_period
  ON usage_rollups (model, period_type, period_start DESC)
  WHERE model <> '';
CREATE INDEX IF NOT EXISTS idx_usage_rollups_cost_rank
  ON usage_rollups (period_type, period_start DESC, dimension_type, cost DESC)
  WHERE dimension_type = 'api_key';

CREATE TABLE IF NOT EXISTS usage_backfill_runs (
  run_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT
);
`

const EVENT_COLUMNS = [
  'event_id',
  'request_id',
  'timestamp',
  'api_key_id',
  'api_key_name',
  'account_id',
  'account_type',
  'model',
  'normalized_model',
  'endpoint',
  'method',
  'status_code',
  'stream',
  'duration_ms',
  'input_tokens',
  'output_tokens',
  'cache_create_tokens',
  'cache_read_tokens',
  'ephemeral_5m_tokens',
  'ephemeral_1h_tokens',
  'total_tokens',
  'cost',
  'real_cost',
  'cost_breakdown',
  'real_cost_breakdown',
  'pricing_source',
  'used_fallback_pricing',
  'is_long_context_request',
  'metadata'
]

const ROLLUP_COLUMNS = [
  'source_type',
  'period_type',
  'period_start',
  'dimension_type',
  'api_key_id',
  'model',
  'request_count',
  'input_tokens',
  'output_tokens',
  'cache_create_tokens',
  'cache_read_tokens',
  'ephemeral_5m_tokens',
  'ephemeral_1h_tokens',
  'total_tokens',
  'cost',
  'real_cost',
  'long_context_requests'
]

const ROLLUP_INCREMENT_COLUMNS = [
  'request_count',
  'input_tokens',
  'output_tokens',
  'cache_create_tokens',
  'cache_read_tokens',
  'ephemeral_5m_tokens',
  'ephemeral_1h_tokens',
  'total_tokens',
  'cost',
  'real_cost',
  'long_context_requests'
]

function normalizeText(value, fallback = null) {
  if (value === null || value === undefined) {
    return fallback
  }

  const normalized = String(value).split('\u0000').join('').trim()
  return normalized ? normalized : fallback
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

function normalizeDate(value, fallback = new Date()) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : date
}

function jsonParam(value, fallback = null) {
  if (value === undefined) {
    return fallback
  }

  return JSON.stringify(value)
}

function normalizeModelName(model) {
  const normalized = normalizeText(model, 'unknown')
  if (!normalized || normalized === 'unknown') {
    return normalized
  }

  if (normalized.includes('.anthropic.') || normalized.includes('.claude')) {
    return normalized
      .replace(/^[a-z0-9-]+\./, '')
      .replace('anthropic.', '')
      .replace(/-v\d+:\d+$/, '')
  }

  return normalized.replace(/-v\d+:\d+$|:latest$/, '')
}

function getOffsetMs() {
  return (config.system?.timezoneOffset || 8) * 3600000
}

function getPeriodStart(timestamp, periodType) {
  if (periodType === 'all') {
    return new Date(Date.UTC(1970, 0, 1))
  }

  const date = normalizeDate(timestamp)
  const offsetMs = getOffsetMs()
  const shifted = new Date(date.getTime() + offsetMs)
  const year = shifted.getUTCFullYear()
  const month = shifted.getUTCMonth()
  const day = shifted.getUTCDate()
  const hour = shifted.getUTCHours()

  if (periodType === 'month') {
    return new Date(Date.UTC(year, month, 1) - offsetMs)
  }

  if (periodType === 'day') {
    return new Date(Date.UTC(year, month, day) - offsetMs)
  }

  return new Date(Date.UTC(year, month, day, hour) - offsetMs)
}

function getDateRange(timeRange) {
  const now = new Date()
  const end = now

  if (timeRange === 'all') {
    return { useAll: true }
  }

  if (timeRange === 'today') {
    const start = getPeriodStart(now, 'day')
    return { start, end }
  }

  const days = timeRange === '30days' ? 30 : 7
  const todayStart = getPeriodStart(now, 'day')
  const start = new Date(todayStart.getTime() - (days - 1) * 86400000)
  return { start, end }
}

function getCurrentPeriodStart(periodType) {
  return getPeriodStart(new Date(), periodType)
}

function formatLocalDate(date) {
  const shifted = new Date(normalizeDate(date).getTime() + getOffsetMs())
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(
    2,
    '0'
  )}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

function formatLocalHourLabel(date) {
  const shifted = new Date(normalizeDate(date).getTime() + getOffsetMs())
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  const hour = String(shifted.getUTCHours()).padStart(2, '0')
  return `${month}/${day} ${hour}:00`
}

function formatCost(cost) {
  return `$${normalizeNumber(cost).toFixed(6)}`
}

function addPeriod(date, periodType, count = 1) {
  const current = normalizeDate(date)
  if (periodType === 'hour') {
    return new Date(current.getTime() + count * 3600000)
  }
  if (periodType === 'month') {
    const shifted = new Date(current.getTime() + getOffsetMs())
    shifted.setUTCMonth(shifted.getUTCMonth() + count)
    return getPeriodStart(new Date(shifted.getTime() - getOffsetMs()), 'month')
  }
  return new Date(current.getTime() + count * 86400000)
}

function buildPeriodInfos({ granularity = 'day', days = 7, startDate = null, endDate = null }) {
  const periodType = granularity === 'hour' ? 'hour' : 'day'

  if (periodType === 'hour') {
    const end = getPeriodStart(endDate ? normalizeDate(endDate) : new Date(), 'hour')
    const fallbackStart = new Date(end.getTime() - 24 * 3600000)
    const start = getPeriodStart(startDate ? normalizeDate(startDate) : fallbackStart, 'hour')
    const periodInfos = []
    for (let cursor = start; cursor <= end; cursor = addPeriod(cursor, 'hour')) {
      periodInfos.push({
        periodStart: cursor,
        hour: cursor.toISOString(),
        label: formatLocalHourLabel(cursor)
      })
    }
    return { periodType, periodInfos }
  }

  if (startDate && endDate) {
    const start = getPeriodStart(normalizeDate(startDate), 'day')
    const end = getPeriodStart(normalizeDate(endDate), 'day')
    const periodInfos = []
    if (start > end) {
      return { periodType, periodInfos }
    }

    for (let cursor = start; cursor <= end; cursor = addPeriod(cursor, 'day')) {
      periodInfos.push({
        periodStart: cursor,
        date: formatLocalDate(cursor)
      })
    }
    return { periodType, periodInfos }
  }

  const daysCount = Math.max(1, parseInt(days) || 7)
  const todayStart = getCurrentPeriodStart('day')
  const periodInfos = []
  for (let i = daysCount - 1; i >= 0; i -= 1) {
    const periodStart = addPeriod(todayStart, 'day', -i)
    periodInfos.push({
      periodStart,
      date: formatLocalDate(periodStart)
    })
  }
  return { periodType, periodInfos }
}

function rowHasUsage(row = {}) {
  return (
    normalizeInteger(row.request_count) > 0 ||
    normalizeInteger(row.total_tokens) > 0 ||
    normalizeNumber(row.cost) > 0 ||
    normalizeNumber(row.real_cost) > 0
  )
}

function pickPreferredRollup(rows = [], periodType) {
  const apiKeyRow = rows.find(
    (row) => row.period_type === periodType && row.dimension_type === 'api_key'
  )
  if (apiKeyRow) {
    return apiKeyRow
  }
  return rows.find((row) => row.period_type === periodType && row.dimension_type === 'global') || {}
}

function buildUsagePoint(base, row = {}) {
  const inputTokens = normalizeInteger(row.input_tokens)
  const outputTokens = normalizeInteger(row.output_tokens)
  const cacheCreateTokens = normalizeInteger(row.cache_create_tokens)
  const cacheReadTokens = normalizeInteger(row.cache_read_tokens)
  const totalTokens =
    normalizeInteger(row.total_tokens) ||
    inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens
  const cost = normalizeNumber(row.cost)

  return {
    ...base,
    inputTokens,
    outputTokens,
    requests: normalizeInteger(row.request_count),
    cacheCreateTokens,
    cacheReadTokens,
    totalTokens,
    cost,
    formattedCost: formatCost(cost)
  }
}

function normalizeUsageEvent(event = {}) {
  const requestId = normalizeText(event.requestId)
  const timestamp = normalizeDate(event.timestamp)
  const inputTokens = normalizeInteger(event.inputTokens)
  const outputTokens = normalizeInteger(event.outputTokens)
  const cacheCreateTokens = normalizeInteger(event.cacheCreateTokens)
  const cacheReadTokens = normalizeInteger(event.cacheReadTokens)
  const totalTokens =
    normalizeInteger(event.totalTokens) ||
    inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens
  const model = normalizeText(event.model, 'unknown')

  return {
    eventId: normalizeText(event.eventId, requestId || `usage_${uuidv4()}`),
    requestId,
    timestamp,
    apiKeyId: normalizeText(event.apiKeyId),
    apiKeyName: normalizeText(event.apiKeyName),
    accountId: normalizeText(event.accountId),
    accountType: normalizeText(event.accountType),
    model,
    normalizedModel: normalizeModelName(model),
    endpoint: normalizeText(event.endpoint),
    method: normalizeText(event.method),
    statusCode: normalizeNullableInteger(event.statusCode),
    stream: event.stream === true,
    durationMs: normalizeNullableInteger(event.durationMs),
    inputTokens,
    outputTokens,
    cacheCreateTokens,
    cacheReadTokens,
    ephemeral5mTokens: normalizeInteger(event.ephemeral5mTokens),
    ephemeral1hTokens: normalizeInteger(event.ephemeral1hTokens),
    totalTokens,
    cost: normalizeNumber(event.cost),
    realCost: normalizeNumber(event.realCost),
    costBreakdown: event.costBreakdown ?? null,
    realCostBreakdown: event.realCostBreakdown ?? event.costBreakdown ?? null,
    pricingSource: normalizeText(event.pricingSource),
    usedFallbackPricing: event.usedFallbackPricing === true,
    isLongContextRequest: event.isLongContextRequest === true || event.isLongContext === true,
    metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {}
  }
}

function getEventColumnValue(event, column) {
  switch (column) {
    case 'event_id':
      return event.eventId
    case 'request_id':
      return event.requestId
    case 'timestamp':
      return event.timestamp
    case 'api_key_id':
      return event.apiKeyId
    case 'api_key_name':
      return event.apiKeyName
    case 'account_id':
      return event.accountId
    case 'account_type':
      return event.accountType
    case 'model':
      return event.model
    case 'normalized_model':
      return event.normalizedModel
    case 'endpoint':
      return event.endpoint
    case 'method':
      return event.method
    case 'status_code':
      return event.statusCode
    case 'stream':
      return event.stream
    case 'duration_ms':
      return event.durationMs
    case 'input_tokens':
      return event.inputTokens
    case 'output_tokens':
      return event.outputTokens
    case 'cache_create_tokens':
      return event.cacheCreateTokens
    case 'cache_read_tokens':
      return event.cacheReadTokens
    case 'ephemeral_5m_tokens':
      return event.ephemeral5mTokens
    case 'ephemeral_1h_tokens':
      return event.ephemeral1hTokens
    case 'total_tokens':
      return event.totalTokens
    case 'cost':
      return event.cost
    case 'real_cost':
      return event.realCost
    case 'cost_breakdown':
      return jsonParam(event.costBreakdown)
    case 'real_cost_breakdown':
      return jsonParam(event.realCostBreakdown)
    case 'pricing_source':
      return event.pricingSource
    case 'used_fallback_pricing':
      return event.usedFallbackPricing
    case 'is_long_context_request':
      return event.isLongContextRequest
    case 'metadata':
      return jsonParam(event.metadata, '{}')
    default:
      return null
  }
}

function buildRollupRows(event, sourceType = 'event') {
  const periods = ['hour', 'day', 'month', 'all'].map((periodType) => ({
    periodType,
    periodStart: getPeriodStart(event.timestamp, periodType)
  }))

  const dimensions = [
    { dimensionType: 'global', apiKeyId: '', model: '' },
    { dimensionType: 'api_key', apiKeyId: event.apiKeyId, model: '' },
    { dimensionType: 'model', apiKeyId: '', model: event.normalizedModel },
    { dimensionType: 'api_key_model', apiKeyId: event.apiKeyId, model: event.normalizedModel }
  ]

  const rows = []
  for (const period of periods) {
    for (const dimension of dimensions) {
      rows.push({
        sourceType,
        ...period,
        ...dimension,
        requestCount: 1,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        cacheCreateTokens: event.cacheCreateTokens,
        cacheReadTokens: event.cacheReadTokens,
        ephemeral5mTokens: event.ephemeral5mTokens,
        ephemeral1hTokens: event.ephemeral1hTokens,
        totalTokens: event.totalTokens,
        cost: event.cost,
        realCost: event.realCost,
        longContextRequests: event.isLongContextRequest ? 1 : 0
      })
    }
  }

  return rows
}

function getRollupColumnValue(row, column) {
  switch (column) {
    case 'source_type':
      return row.sourceType
    case 'period_type':
      return row.periodType
    case 'period_start':
      return row.periodStart
    case 'dimension_type':
      return row.dimensionType
    case 'api_key_id':
      return row.apiKeyId
    case 'model':
      return row.model
    case 'request_count':
      return row.requestCount
    case 'input_tokens':
      return row.inputTokens
    case 'output_tokens':
      return row.outputTokens
    case 'cache_create_tokens':
      return row.cacheCreateTokens
    case 'cache_read_tokens':
      return row.cacheReadTokens
    case 'ephemeral_5m_tokens':
      return row.ephemeral5mTokens
    case 'ephemeral_1h_tokens':
      return row.ephemeral1hTokens
    case 'total_tokens':
      return row.totalTokens
    case 'cost':
      return row.cost
    case 'real_cost':
      return row.realCost
    case 'long_context_requests':
      return row.longContextRequests
    default:
      return null
  }
}

function buildInsertPlaceholders(rowCount, columnCount) {
  return Array.from({ length: rowCount }, (_row, rowIndex) => {
    const start = rowIndex * columnCount
    return `(${Array.from(
      { length: columnCount },
      (_column, columnIndex) => `$${start + columnIndex + 1}`
    ).join(', ')})`
  }).join(', ')
}

async function insertEvent(client, event) {
  const values = EVENT_COLUMNS.map((column) => getEventColumnValue(event, column))
  const placeholders = buildInsertPlaceholders(1, EVENT_COLUMNS.length)
  const result = await client.query(
    `
      INSERT INTO usage_events (${EVENT_COLUMNS.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `,
    values
  )

  return result.rowCount > 0
}

async function incrementRollups(client, event) {
  const rows = buildRollupRows(event)
  const values = []
  for (const row of rows) {
    values.push(...ROLLUP_COLUMNS.map((column) => getRollupColumnValue(row, column)))
  }

  const assignments = ROLLUP_INCREMENT_COLUMNS.map(
    (column) => `${column} = usage_rollups.${column} + EXCLUDED.${column}`
  )
    .concat('updated_at = now()')
    .join(', ')

  await client.query(
    `
      INSERT INTO usage_rollups (${ROLLUP_COLUMNS.join(', ')})
      VALUES ${buildInsertPlaceholders(rows.length, ROLLUP_COLUMNS.length)}
      ON CONFLICT (source_type, period_type, period_start, dimension_type, api_key_id, model)
      DO UPDATE SET ${assignments}
    `,
    values
  )
}

function normalizeRollupRow(row = {}, defaultSourceType = 'redis_baseline') {
  const model = normalizeText(row.model, '')
  return {
    sourceType: normalizeText(row.sourceType, defaultSourceType),
    periodType: normalizeText(row.periodType),
    periodStart: normalizeDate(row.periodStart),
    dimensionType: normalizeText(row.dimensionType),
    apiKeyId: normalizeText(row.apiKeyId, ''),
    model: model ? normalizeModelName(model) : '',
    requestCount: normalizeInteger(row.requestCount),
    inputTokens: normalizeInteger(row.inputTokens),
    outputTokens: normalizeInteger(row.outputTokens),
    cacheCreateTokens: normalizeInteger(row.cacheCreateTokens),
    cacheReadTokens: normalizeInteger(row.cacheReadTokens),
    ephemeral5mTokens: normalizeInteger(row.ephemeral5mTokens),
    ephemeral1hTokens: normalizeInteger(row.ephemeral1hTokens),
    totalTokens: normalizeInteger(row.totalTokens),
    cost: normalizeNumber(row.cost),
    realCost: normalizeNumber(row.realCost),
    longContextRequests: normalizeInteger(row.longContextRequests)
  }
}

async function upsertRollupRows(rows = [], options = {}) {
  const sourceType = normalizeText(options.sourceType, 'redis_baseline')
  const normalizedRows = rows
    .map((row) => normalizeRollupRow(row, sourceType))
    .filter((row) => row.periodType && row.periodStart && row.dimensionType)

  if (normalizedRows.length === 0) {
    return { upserted: 0 }
  }

  const values = []
  for (const row of normalizedRows) {
    values.push(...ROLLUP_COLUMNS.map((column) => getRollupColumnValue(row, column)))
  }

  const assignments = ROLLUP_INCREMENT_COLUMNS.map((column) => `${column} = EXCLUDED.${column}`)
    .concat('updated_at = now()')
    .join(', ')

  await postgres.query(
    `
      INSERT INTO usage_rollups (${ROLLUP_COLUMNS.join(', ')})
      VALUES ${buildInsertPlaceholders(normalizedRows.length, ROLLUP_COLUMNS.length)}
      ON CONFLICT (source_type, period_type, period_start, dimension_type, api_key_id, model)
      DO UPDATE SET ${assignments}
    `,
    values
  )

  return { upserted: normalizedRows.length }
}

function rollupRowToUsage(row = {}) {
  return {
    tokens: normalizeInteger(row.total_tokens),
    inputTokens: normalizeInteger(row.input_tokens),
    outputTokens: normalizeInteger(row.output_tokens),
    cacheCreateTokens: normalizeInteger(row.cache_create_tokens),
    cacheReadTokens: normalizeInteger(row.cache_read_tokens),
    ephemeral5mTokens: normalizeInteger(row.ephemeral_5m_tokens),
    ephemeral1hTokens: normalizeInteger(row.ephemeral_1h_tokens),
    allTokens: normalizeInteger(row.total_tokens),
    requests: normalizeInteger(row.request_count)
  }
}

function emptyUsage() {
  return {
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreateTokens: 0,
    cacheReadTokens: 0,
    ephemeral5mTokens: 0,
    ephemeral1hTokens: 0,
    allTokens: 0,
    requests: 0
  }
}

function eventRowToUsageRecord(row = {}) {
  const breakdown = row.real_cost_breakdown || row.cost_breakdown || undefined
  return {
    timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : null,
    model: row.model || 'unknown',
    accountId: row.account_id || null,
    accountType: row.account_type || null,
    requestId: row.request_id || null,
    endpoint: row.endpoint || null,
    method: row.method || null,
    statusCode: row.status_code ?? null,
    stream: row.stream === true,
    durationMs: row.duration_ms ?? null,
    inputTokens: normalizeInteger(row.input_tokens),
    outputTokens: normalizeInteger(row.output_tokens),
    cacheCreateTokens: normalizeInteger(row.cache_create_tokens),
    cacheReadTokens: normalizeInteger(row.cache_read_tokens),
    ephemeral5mTokens: normalizeInteger(row.ephemeral_5m_tokens),
    ephemeral1hTokens: normalizeInteger(row.ephemeral_1h_tokens),
    totalTokens: normalizeInteger(row.total_tokens),
    cost: normalizeNumber(row.cost),
    realCost: normalizeNumber(row.real_cost),
    costBreakdown: breakdown,
    realCostBreakdown: breakdown,
    pricingSource: row.pricing_source || null,
    usedFallbackPricing: row.used_fallback_pricing === true,
    isLongContext: row.is_long_context_request === true
  }
}

async function ensureSchema() {
  await postgres.query(USAGE_SCHEMA_SQL)
}

async function resetSchema() {
  await postgres.query(USAGE_RESET_SCHEMA_SQL)
  await ensureSchema()
}

async function upsertUsageEvents(events = []) {
  const normalizedEvents = events.map(normalizeUsageEvent).filter((event) => event.apiKeyId)
  if (normalizedEvents.length === 0) {
    return { inserted: 0, skipped: 0 }
  }

  return postgres.transaction(async (client) => {
    let inserted = 0
    let skipped = 0

    for (const event of normalizedEvents) {
      const didInsert = await insertEvent(client, event)
      if (didInsert) {
        await incrementRollups(client, event)
        inserted++
      } else {
        skipped++
      }
    }

    return { inserted, skipped }
  })
}

async function insertUsageEventsOnly(events = []) {
  const normalizedEvents = events.map(normalizeUsageEvent).filter((event) => event.apiKeyId)
  if (normalizedEvents.length === 0) {
    return { inserted: 0, skipped: 0 }
  }

  return postgres.transaction(async (client) => {
    let inserted = 0
    let skipped = 0

    for (const event of normalizedEvents) {
      const didInsert = await insertEvent(client, event)
      if (didInsert) {
        inserted++
      } else {
        skipped++
      }
    }

    return { inserted, skipped }
  })
}

async function upsertUsageEvent(event = {}) {
  return upsertUsageEvents([event])
}

async function getUsageStats(keyId, { createdAt = null } = {}) {
  const currentDay = getCurrentPeriodStart('day')
  const currentMonth = getCurrentPeriodStart('month')
  const allStart = getCurrentPeriodStart('all')
  const result = await postgres.query(
    `
      SELECT
        period_type,
        SUM(request_count) AS request_count,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cache_create_tokens) AS cache_create_tokens,
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(ephemeral_5m_tokens) AS ephemeral_5m_tokens,
        SUM(ephemeral_1h_tokens) AS ephemeral_1h_tokens,
        SUM(total_tokens) AS total_tokens
      FROM usage_rollups
      WHERE dimension_type = 'api_key'
        AND api_key_id = $1
        AND model = ''
        AND (
          (period_type = 'all' AND period_start = $2)
          OR (period_type = 'day' AND period_start = $3)
          OR (period_type = 'month' AND period_start = $4)
        )
      GROUP BY period_type
    `,
    [keyId, allStart, currentDay, currentMonth]
  )

  const byPeriod = new Map(result.rows.map((row) => [row.period_type, row]))
  const total = rollupRowToUsage(byPeriod.get('all') || {})
  const daily = rollupRowToUsage(byPeriod.get('day') || {})
  const monthly = rollupRowToUsage(byPeriod.get('month') || {})

  const created = createdAt ? normalizeDate(createdAt, new Date()) : new Date()
  const now = new Date()
  const daysSinceCreated = Math.max(1, Math.ceil((now - created) / (1000 * 60 * 60 * 24)))
  const totalMinutes = Math.max(1, daysSinceCreated * 24 * 60)

  return {
    total,
    daily,
    monthly,
    averages: {
      rpm: Math.round((total.requests / totalMinutes) * 100) / 100,
      tpm: Math.round((total.tokens / totalMinutes) * 100) / 100,
      dailyRequests: Math.round((total.requests / daysSinceCreated) * 100) / 100,
      dailyTokens: Math.round((total.tokens / daysSinceCreated) * 100) / 100
    }
  }
}

async function getCostStats(keyId) {
  const currentHour = getCurrentPeriodStart('hour')
  const currentDay = getCurrentPeriodStart('day')
  const currentMonth = getCurrentPeriodStart('month')
  const allStart = getCurrentPeriodStart('all')
  const result = await postgres.query(
    `
      SELECT period_type, SUM(cost) AS cost, SUM(real_cost) AS real_cost
      FROM usage_rollups
      WHERE dimension_type = 'api_key'
        AND api_key_id = $1
        AND model = ''
        AND (
          (period_type = 'hour' AND period_start = $2)
          OR (period_type = 'day' AND period_start = $3)
          OR (period_type = 'month' AND period_start = $4)
          OR (period_type = 'all' AND period_start = $5)
        )
      GROUP BY period_type
    `,
    [keyId, currentHour, currentDay, currentMonth, allStart]
  )

  const byPeriod = new Map(result.rows.map((row) => [row.period_type, row]))
  const daily = byPeriod.get('day') || {}
  const all = byPeriod.get('all') || {}

  return {
    daily: normalizeNumber(daily.cost),
    monthly: normalizeNumber(byPeriod.get('month')?.cost),
    hourly: normalizeNumber(byPeriod.get('hour')?.cost),
    total: normalizeNumber(all.cost),
    realTotal: normalizeNumber(all.real_cost),
    realDaily: normalizeNumber(daily.real_cost)
  }
}

async function getDailyCost(keyId) {
  const stats = await getCostStats(keyId)
  return stats.daily
}

async function getKeyUsageSummary(keyId, timeRange = 'all', startDate = null, endDate = null) {
  let result

  if (timeRange === 'all') {
    result = await postgres.query(
      `
        SELECT
          SUM(request_count) AS request_count,
          SUM(input_tokens) AS input_tokens,
          SUM(output_tokens) AS output_tokens,
          SUM(cache_create_tokens) AS cache_create_tokens,
          SUM(cache_read_tokens) AS cache_read_tokens,
          SUM(ephemeral_5m_tokens) AS ephemeral_5m_tokens,
          SUM(ephemeral_1h_tokens) AS ephemeral_1h_tokens,
          SUM(total_tokens) AS total_tokens,
          SUM(cost) AS cost,
          SUM(real_cost) AS real_cost
        FROM usage_rollups
        WHERE period_type = 'all'
          AND period_start = $1
          AND dimension_type = 'api_key'
          AND api_key_id = $2
          AND model = ''
      `,
      [getCurrentPeriodStart('all'), keyId]
    )
  } else {
    let range
    if (timeRange === 'custom') {
      const start = normalizeDate(startDate, null)
      const end = normalizeDate(`${endDate}T23:59:59.999`, null)
      if (!start || !end) {
        return {
          ...emptyUsage(),
          cost: 0,
          realCost: 0
        }
      }
      range = {
        start: getPeriodStart(start, 'day'),
        end: getPeriodStart(end, 'day')
      }
    } else {
      range = getDateRange(timeRange)
    }

    result = await postgres.query(
      `
        SELECT
          SUM(request_count) AS request_count,
          SUM(input_tokens) AS input_tokens,
          SUM(output_tokens) AS output_tokens,
          SUM(cache_create_tokens) AS cache_create_tokens,
          SUM(cache_read_tokens) AS cache_read_tokens,
          SUM(ephemeral_5m_tokens) AS ephemeral_5m_tokens,
          SUM(ephemeral_1h_tokens) AS ephemeral_1h_tokens,
          SUM(total_tokens) AS total_tokens,
          SUM(cost) AS cost,
          SUM(real_cost) AS real_cost
        FROM usage_rollups
        WHERE period_type = 'day'
          AND period_start >= $1
          AND period_start <= $2
          AND dimension_type = 'api_key'
          AND api_key_id = $3
          AND model = ''
      `,
      [range.start, range.end, keyId]
    )
  }

  const row = result.rows[0] || {}
  return {
    ...rollupRowToUsage(row),
    cost: normalizeNumber(row.cost),
    realCost: normalizeNumber(row.real_cost)
  }
}

async function getUsageRecords(keyId, limit = 50) {
  const result = await postgres.query(
    `
      SELECT *
      FROM usage_events
      WHERE api_key_id = $1
      ORDER BY timestamp DESC, event_id DESC
      LIMIT $2
    `,
    [keyId, Math.max(1, normalizeInteger(limit, 50))]
  )

  return result.rows.map(eventRowToUsageRecord)
}

async function getModelStatsForKey(keyId, period = 'monthly') {
  const periodType = period === 'daily' ? 'day' : period === 'alltime' ? 'all' : 'month'
  const periodStart = getCurrentPeriodStart(periodType)
  const result = await postgres.query(
    `
      SELECT
        model,
        SUM(request_count) AS request_count,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cache_create_tokens) AS cache_create_tokens,
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(ephemeral_5m_tokens) AS ephemeral_5m_tokens,
        SUM(ephemeral_1h_tokens) AS ephemeral_1h_tokens,
        SUM(total_tokens) AS total_tokens,
        SUM(cost) AS cost,
        SUM(real_cost) AS real_cost
      FROM usage_rollups
      WHERE period_type = $1
        AND period_start = $2
        AND dimension_type = 'api_key_model'
        AND api_key_id = $3
        AND model <> ''
      GROUP BY model
      ORDER BY total_tokens DESC
    `,
    [periodType, periodStart, keyId]
  )

  return result.rows
}

async function getBatchModelStats(keyIds = [], period = 'daily') {
  if (keyIds.length === 0) {
    return []
  }

  const periodType = period === 'daily' ? 'day' : 'month'
  const periodStart = getCurrentPeriodStart(periodType)
  const result = await postgres.query(
    `
      SELECT
        model,
        SUM(request_count) AS request_count,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cache_create_tokens) AS cache_create_tokens,
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(ephemeral_5m_tokens) AS ephemeral_5m_tokens,
        SUM(ephemeral_1h_tokens) AS ephemeral_1h_tokens,
        SUM(total_tokens) AS total_tokens,
        SUM(cost) AS cost,
        SUM(real_cost) AS real_cost
      FROM usage_rollups
      WHERE period_type = $1
        AND period_start = $2
        AND dimension_type = 'api_key_model'
        AND api_key_id = ANY($3)
        AND model <> ''
      GROUP BY model
      ORDER BY SUM(total_tokens) DESC
    `,
    [periodType, periodStart, keyIds]
  )

  return result.rows
}

async function getAllUsedModels() {
  const result = await postgres.query(
    `
      SELECT DISTINCT model
      FROM usage_rollups
      WHERE dimension_type IN ('model', 'api_key_model')
        AND model <> ''
      ORDER BY model ASC
    `
  )

  return result.rows.map((row) => row.model).filter(Boolean)
}

async function getKeyIdsWithModels(keyIds = [], models = []) {
  if (keyIds.length === 0 || models.length === 0) {
    return new Set()
  }

  const normalizedModels = models.map(normalizeModelName)
  const result = await postgres.query(
    `
      SELECT DISTINCT api_key_id
      FROM usage_rollups
      WHERE dimension_type = 'api_key_model'
        AND api_key_id = ANY($1)
        AND model = ANY($2)
    `,
    [keyIds, normalizedModels]
  )

  return new Set(result.rows.map((row) => row.api_key_id))
}

async function getBatchKeyCosts(timeRange, keyIds = []) {
  const costs = new Map(keyIds.map((keyId) => [keyId, 0]))
  if (keyIds.length === 0) {
    return costs
  }

  const dateRange = getDateRange(timeRange)
  let result
  if (dateRange.useAll) {
    result = await postgres.query(
      `
        SELECT api_key_id, SUM(cost) AS cost
        FROM usage_rollups
        WHERE period_type = 'all'
          AND period_start = $1
          AND dimension_type = 'api_key'
          AND api_key_id = ANY($2)
          AND model = ''
        GROUP BY api_key_id
      `,
      [getCurrentPeriodStart('all'), keyIds]
    )
  } else {
    result = await postgres.query(
      `
        SELECT api_key_id, SUM(cost) AS cost
        FROM usage_rollups
        WHERE period_type = 'day'
          AND period_start >= $1
          AND period_start <= $2
          AND dimension_type = 'api_key'
          AND api_key_id = ANY($3)
          AND model = ''
        GROUP BY api_key_id
      `,
      [dateRange.start, getCurrentPeriodStart('day'), keyIds]
    )
  }

  for (const row of result.rows) {
    costs.set(row.api_key_id, normalizeNumber(row.cost))
  }

  return costs
}

async function calculateCustomRangeCosts(keyIds = [], startDate, endDate) {
  const costs = new Map(keyIds.map((keyId) => [keyId, 0]))
  if (keyIds.length === 0 || !startDate || !endDate) {
    return costs
  }

  const start = normalizeDate(startDate, null)
  const end = normalizeDate(`${endDate}T23:59:59.999`, null)
  if (!start || !end) {
    return costs
  }

  const result = await postgres.query(
    `
      SELECT api_key_id, SUM(cost) AS cost
      FROM usage_rollups
      WHERE period_type = 'day'
        AND period_start >= $1
        AND period_start <= $2
        AND dimension_type = 'api_key'
        AND api_key_id = ANY($3)
        AND model = ''
      GROUP BY api_key_id
    `,
    [getPeriodStart(start, 'day'), getPeriodStart(end, 'day'), keyIds]
  )

  for (const row of result.rows) {
    costs.set(row.api_key_id, normalizeNumber(row.cost))
  }

  return costs
}

async function getGlobalUsageSummary() {
  const allStart = getCurrentPeriodStart('all')
  const currentDay = getCurrentPeriodStart('day')
  const result = await postgres.query(
    `
      SELECT
        dimension_type,
        period_type,
        SUM(request_count) AS request_count,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cache_create_tokens) AS cache_create_tokens,
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(ephemeral_5m_tokens) AS ephemeral_5m_tokens,
        SUM(ephemeral_1h_tokens) AS ephemeral_1h_tokens,
        SUM(total_tokens) AS total_tokens,
        SUM(cost) AS cost,
        SUM(real_cost) AS real_cost
      FROM usage_rollups
      WHERE model = ''
        AND dimension_type IN ('api_key', 'global')
        AND (
          (period_type = 'all' AND period_start = $1)
          OR (period_type = 'day' AND period_start = $2)
        )
      GROUP BY dimension_type, period_type
    `,
    [allStart, currentDay]
  )

  const firstUsageResult = await postgres.query(
    `
      SELECT MIN(period_start) AS first_period_start
      FROM usage_rollups
      WHERE model = ''
        AND dimension_type IN ('api_key', 'global')
        AND period_type IN ('hour', 'day', 'month')
    `
  )

  const totalRow = pickPreferredRollup(result.rows, 'all')
  const todayRow = pickPreferredRollup(result.rows, 'day')
  const total = rollupRowToUsage(totalRow)
  const daily = rollupRowToUsage(todayRow)
  const firstPeriod = firstUsageResult.rows[0]?.first_period_start
    ? normalizeDate(firstUsageResult.rows[0].first_period_start)
    : new Date()
  const totalMinutes = Math.max(1, Math.ceil((new Date() - firstPeriod) / 60000))

  return {
    total,
    daily,
    costs: {
      total: normalizeNumber(totalRow.cost),
      realTotal: normalizeNumber(totalRow.real_cost),
      daily: normalizeNumber(todayRow.cost),
      realDaily: normalizeNumber(todayRow.real_cost)
    },
    averages: {
      rpm: Math.round((total.requests / totalMinutes) * 100) / 100,
      tpm: Math.round((total.allTokens / totalMinutes) * 100) / 100
    },
    hasData: rowHasUsage(totalRow) || rowHasUsage(todayRow)
  }
}

async function getUsageTrend({
  days = 7,
  granularity = 'day',
  startDate = null,
  endDate = null
} = {}) {
  const { periodType, periodInfos } = buildPeriodInfos({ days, granularity, startDate, endDate })
  if (periodInfos.length === 0) {
    return []
  }

  const periodStarts = periodInfos.map((info) => info.periodStart)
  const result = await postgres.query(
    `
      SELECT
        period_type,
        dimension_type,
        period_start,
        SUM(request_count) AS request_count,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cache_create_tokens) AS cache_create_tokens,
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(ephemeral_5m_tokens) AS ephemeral_5m_tokens,
        SUM(ephemeral_1h_tokens) AS ephemeral_1h_tokens,
        SUM(total_tokens) AS total_tokens,
        SUM(cost) AS cost,
        SUM(real_cost) AS real_cost
      FROM usage_rollups
      WHERE period_type = $1
        AND period_start = ANY($2::timestamptz[])
        AND model = ''
        AND dimension_type IN ('api_key', 'global')
      GROUP BY period_type, dimension_type, period_start
    `,
    [periodType, periodStarts]
  )

  const rowsByPeriod = new Map()
  for (const row of result.rows) {
    const key = new Date(row.period_start).toISOString()
    if (!rowsByPeriod.has(key)) {
      rowsByPeriod.set(key, [])
    }
    rowsByPeriod.get(key).push(row)
  }

  return periodInfos.map((info) => {
    const row = pickPreferredRollup(
      rowsByPeriod.get(info.periodStart.toISOString()) || [],
      periodType
    )
    const base =
      periodType === 'hour' ? { hour: info.hour, label: info.label } : { date: info.date }
    return buildUsagePoint(base, row)
  })
}

async function getGlobalModelStats({ period = 'daily', startDate = null, endDate = null } = {}) {
  let periodType
  let params
  let whereClause

  if (startDate && endDate) {
    const start = getPeriodStart(normalizeDate(startDate), 'day')
    const end = getPeriodStart(normalizeDate(endDate), 'day')
    periodType = 'day'
    whereClause = `period_type = $1 AND period_start >= $2 AND period_start <= $3`
    params = [periodType, start, end]
  } else {
    periodType =
      period === 'daily' ? 'day' : period === 'all' || period === 'alltime' ? 'all' : 'month'
    whereClause = `period_type = $1 AND period_start = $2`
    params = [periodType, getCurrentPeriodStart(periodType)]
  }

  const result = await postgres.query(
    `
      SELECT
        model,
        SUM(request_count) AS request_count,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cache_create_tokens) AS cache_create_tokens,
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(ephemeral_5m_tokens) AS ephemeral_5m_tokens,
        SUM(ephemeral_1h_tokens) AS ephemeral_1h_tokens,
        SUM(total_tokens) AS total_tokens,
        SUM(cost) AS cost,
        SUM(real_cost) AS real_cost
      FROM usage_rollups
      WHERE ${whereClause}
        AND dimension_type = 'model'
        AND model <> ''
      GROUP BY model
      ORDER BY SUM(cost) DESC, SUM(total_tokens) DESC
    `,
    params
  )

  return result.rows
}

async function getUsageCosts(period = 'all') {
  let periodType
  let params
  let whereClause

  if (period === 'today') {
    periodType = 'day'
    whereClause = `period_type = $1 AND period_start = $2`
    params = [periodType, getCurrentPeriodStart('day')]
  } else if (period === 'monthly') {
    periodType = 'month'
    whereClause = `period_type = $1 AND period_start = $2`
    params = [periodType, getCurrentPeriodStart('month')]
  } else if (period === '7days') {
    const today = getCurrentPeriodStart('day')
    const start = addPeriod(today, 'day', -6)
    periodType = 'day'
    whereClause = `period_type = $1 AND period_start >= $2 AND period_start <= $3`
    params = [periodType, start, today]
  } else {
    periodType = 'all'
    whereClause = `period_type = $1 AND period_start = $2`
    params = [periodType, getCurrentPeriodStart('all')]
  }

  const result = await postgres.query(
    `
      SELECT
        model,
        SUM(request_count) AS request_count,
        SUM(input_tokens) AS input_tokens,
        SUM(output_tokens) AS output_tokens,
        SUM(cache_create_tokens) AS cache_create_tokens,
        SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(ephemeral_5m_tokens) AS ephemeral_5m_tokens,
        SUM(ephemeral_1h_tokens) AS ephemeral_1h_tokens,
        SUM(total_tokens) AS total_tokens,
        SUM(cost) AS cost,
        SUM(real_cost) AS real_cost
      FROM usage_rollups
      WHERE ${whereClause}
        AND dimension_type = 'model'
        AND model <> ''
      GROUP BY model
      ORDER BY SUM(cost) DESC, SUM(total_tokens) DESC
    `,
    params
  )

  let totalCost = 0
  let realTotalCost = 0
  const modelCosts = result.rows.map((row) => {
    const cost = normalizeNumber(row.cost)
    const realCost = normalizeNumber(row.real_cost)
    totalCost += cost
    realTotalCost += realCost
    return {
      model: row.model || 'unknown',
      requests: normalizeInteger(row.request_count),
      usage: {
        input_tokens: normalizeInteger(row.input_tokens),
        output_tokens: normalizeInteger(row.output_tokens),
        cache_creation_input_tokens: normalizeInteger(row.cache_create_tokens),
        cache_read_input_tokens: normalizeInteger(row.cache_read_tokens)
      },
      costs: {
        input: 0,
        output: 0,
        cacheWrite: 0,
        cacheRead: 0,
        total: cost,
        real: realCost
      },
      formatted: {
        input: formatCost(0),
        output: formatCost(0),
        cacheWrite: formatCost(0),
        cacheRead: formatCost(0),
        total: formatCost(cost),
        real: formatCost(realCost)
      }
    }
  })

  return {
    period,
    totalCosts: {
      inputCost: 0,
      outputCost: 0,
      cacheCreateCost: 0,
      cacheReadCost: 0,
      totalCost,
      realTotalCost,
      formatted: {
        inputCost: formatCost(0),
        outputCost: formatCost(0),
        cacheCreateCost: formatCost(0),
        cacheReadCost: formatCost(0),
        totalCost: formatCost(totalCost),
        realTotalCost: formatCost(realTotalCost)
      }
    },
    modelCosts
  }
}

async function getApiKeysUsageTrend({
  apiKeys = [],
  days = 7,
  granularity = 'day',
  startDate = null,
  endDate = null
} = {}) {
  const apiKeyIds = apiKeys.map((key) => key.id).filter(Boolean)
  const apiKeyMap = new Map(apiKeys.map((key) => [key.id, key]))
  const { periodType, periodInfos } = buildPeriodInfos({ days, granularity, startDate, endDate })
  const trendData = periodInfos.map((info) =>
    periodType === 'hour'
      ? { hour: info.hour, label: info.label, apiKeys: {} }
      : { date: info.date, apiKeys: {} }
  )

  if (apiKeyIds.length === 0 || periodInfos.length === 0) {
    return { data: trendData, topApiKeys: [], totalApiKeys: apiKeyIds.length }
  }

  const periodStarts = periodInfos.map((info) => info.periodStart)
  const result = await postgres.query(
    `
      SELECT
        period_start,
        api_key_id,
        SUM(request_count) AS request_count,
        SUM(total_tokens) AS total_tokens,
        SUM(cost) AS cost
      FROM usage_rollups
      WHERE period_type = $1
        AND period_start = ANY($2::timestamptz[])
        AND dimension_type = 'api_key'
        AND api_key_id = ANY($3)
        AND model = ''
      GROUP BY period_start, api_key_id
    `,
    [periodType, periodStarts, apiKeyIds]
  )

  const pointByPeriod = new Map(
    periodInfos.map((info, index) => [info.periodStart.toISOString(), trendData[index]])
  )
  const apiKeyTotals = new Map()
  for (const row of result.rows) {
    const apiKeyId = row.api_key_id
    const point = pointByPeriod.get(new Date(row.period_start).toISOString())
    if (!point || !apiKeyMap.has(apiKeyId)) {
      continue
    }

    const tokens = normalizeInteger(row.total_tokens)
    const cost = normalizeNumber(row.cost)
    point.apiKeys[apiKeyId] = {
      name: apiKeyMap.get(apiKeyId).name || `API Key ${apiKeyId}`,
      tokens,
      requests: normalizeInteger(row.request_count),
      cost,
      formattedCost: formatCost(cost)
    }
    apiKeyTotals.set(apiKeyId, (apiKeyTotals.get(apiKeyId) || 0) + tokens)
  }

  const topApiKeys = Array.from(apiKeyTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([apiKeyId]) => apiKeyId)

  return {
    data: trendData,
    topApiKeys,
    totalApiKeys: apiKeyIds.length
  }
}

async function getAccountUsageTrend({
  accounts = [],
  days = 7,
  granularity = 'day',
  startDate = null,
  endDate = null
} = {}) {
  const accountIds = accounts.map((account) => account.id).filter(Boolean)
  const accountMap = new Map(accounts.map((account) => [account.id, account]))
  const { periodType, periodInfos } = buildPeriodInfos({ days, granularity, startDate, endDate })
  const trendData = periodInfos.map((info) =>
    periodType === 'hour'
      ? { hour: info.hour, label: info.label, accounts: {} }
      : { date: info.date, accounts: {} }
  )

  if (accountIds.length === 0 || periodInfos.length === 0) {
    return { data: trendData, topAccounts: [], totalAccounts: accountIds.length }
  }

  const start = periodInfos[0].periodStart
  const endExclusive = addPeriod(periodInfos[periodInfos.length - 1].periodStart, periodType)
  const bucketExpression =
    periodType === 'hour'
      ? "date_trunc('hour', timestamp + make_interval(secs => $1)) - make_interval(secs => $1)"
      : "date_trunc('day', timestamp + make_interval(secs => $1)) - make_interval(secs => $1)"

  const result = await postgres.query(
    `
      SELECT
        ${bucketExpression} AS period_start,
        account_id,
        SUM(request_count) AS request_count,
        SUM(cost) AS cost
      FROM (
        SELECT
          timestamp,
          account_id,
          1 AS request_count,
          cost
        FROM usage_events
        WHERE timestamp >= $2
          AND timestamp < $3
          AND account_id = ANY($4)
      ) AS usage_rows
      GROUP BY period_start, account_id
    `,
    [Math.trunc(getOffsetMs() / 1000), start, endExclusive, accountIds]
  )

  const pointByPeriod = new Map(
    periodInfos.map((info, index) => [info.periodStart.toISOString(), trendData[index]])
  )
  const accountCostTotals = new Map()
  for (const row of result.rows) {
    const accountId = row.account_id
    const point = pointByPeriod.get(new Date(row.period_start).toISOString())
    if (!point || !accountMap.has(accountId)) {
      continue
    }

    const cost = normalizeNumber(row.cost)
    const accountInfo = accountMap.get(accountId)
    point.accounts[accountId] = {
      name: accountInfo.name || `账号 ${accountId.slice(0, 8)}`,
      cost,
      formattedCost: formatCost(cost),
      requests: normalizeInteger(row.request_count)
    }
    accountCostTotals.set(accountId, (accountCostTotals.get(accountId) || 0) + cost)
  }

  const topAccounts = Array.from(accountCostTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([accountId]) => accountId)

  return {
    data: trendData,
    topAccounts,
    totalAccounts: accountIds.length
  }
}

async function getAccountUsageSummary(accountId) {
  if (!accountId) {
    return {
      totalCost: 0,
      dailyCost: 0,
      monthlyCost: 0,
      totalRequests: 0,
      dailyRequests: 0,
      monthlyRequests: 0
    }
  }

  const currentDay = getCurrentPeriodStart('day')
  const currentMonth = getCurrentPeriodStart('month')
  const result = await postgres.query(
    `
      SELECT
        period_type,
        COUNT(*) AS request_count,
        SUM(cost) AS cost
      FROM (
        SELECT
          CASE
            WHEN timestamp >= $2 THEN 'day'
            ELSE 'month'
          END AS period_type,
          cost
        FROM usage_events
        WHERE account_id = $1
          AND timestamp >= $3
      ) AS scoped
      GROUP BY period_type

      UNION ALL

      SELECT 'all' AS period_type, COUNT(*) AS request_count, SUM(cost) AS cost
      FROM usage_events
      WHERE account_id = $1
    `,
    [accountId, currentDay, currentMonth]
  )

  const rowsByPeriod = new Map()
  for (const row of result.rows) {
    const existing = rowsByPeriod.get(row.period_type) || { request_count: 0, cost: 0 }
    existing.request_count += normalizeInteger(row.request_count)
    existing.cost += normalizeNumber(row.cost)
    rowsByPeriod.set(row.period_type, existing)
  }

  const daily = rowsByPeriod.get('day') || {}
  const monthly = rowsByPeriod.get('month') || {}
  const total = rowsByPeriod.get('all') || {}
  return {
    totalCost: normalizeNumber(total.cost),
    dailyCost: normalizeNumber(daily.cost),
    monthlyCost: normalizeNumber(daily.cost) + normalizeNumber(monthly.cost),
    totalRequests: normalizeInteger(total.request_count),
    dailyRequests: normalizeInteger(daily.request_count),
    monthlyRequests: normalizeInteger(daily.request_count) + normalizeInteger(monthly.request_count)
  }
}

async function recordBackfillRunStart({ runId = uuidv4(), source = 'request_details' } = {}) {
  await postgres.query(
    `
      INSERT INTO usage_backfill_runs (run_id, source, status)
      VALUES ($1, $2, 'running')
      ON CONFLICT (run_id) DO UPDATE SET
        source = EXCLUDED.source,
        status = 'running',
        started_at = now(),
        completed_at = NULL,
        stats = '{}'::jsonb,
        error = NULL
    `,
    [runId, source]
  )
  return runId
}

async function recordBackfillRunComplete(runId, stats = {}) {
  await postgres.query(
    `
      UPDATE usage_backfill_runs
      SET status = 'completed',
        completed_at = now(),
        stats = $2::jsonb,
        error = NULL
      WHERE run_id = $1
    `,
    [runId, JSON.stringify(stats)]
  )
}

async function recordBackfillRunFailed(runId, error, stats = {}) {
  await postgres.query(
    `
      UPDATE usage_backfill_runs
      SET status = 'failed',
        completed_at = now(),
        stats = $2::jsonb,
        error = $3
      WHERE run_id = $1
    `,
    [runId, JSON.stringify(stats), error?.message || String(error)]
  )
}

module.exports = {
  ensureSchema,
  resetSchema,
  upsertUsageEvent,
  upsertUsageEvents,
  insertUsageEventsOnly,
  upsertRollupRows,
  getUsageStats,
  getCostStats,
  getDailyCost,
  getKeyUsageSummary,
  getUsageRecords,
  getModelStatsForKey,
  getBatchModelStats,
  getAllUsedModels,
  getKeyIdsWithModels,
  getBatchKeyCosts,
  calculateCustomRangeCosts,
  getGlobalUsageSummary,
  getUsageTrend,
  getGlobalModelStats,
  getUsageCosts,
  getApiKeysUsageTrend,
  getAccountUsageTrend,
  getAccountUsageSummary,
  normalizeModelName,
  getPeriodStart,
  recordBackfillRunStart,
  recordBackfillRunComplete,
  recordBackfillRunFailed,
  emptyUsage
}

function parseIntegerParam(value, fieldName, defaultValue, { min, max }) {
  if (value === undefined || value === null || value === '') {
    return { value: defaultValue }
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    const range = max === Infinity ? `at least ${min}` : `between ${min} and ${max}`
    return { error: `${fieldName} must be an integer ${range}` }
  }

  return { value: parsed }
}

function parsePaginationQuery(query, options = {}) {
  const defaultLimit = options.defaultLimit ?? 50
  const maxLimit = options.maxLimit ?? 100
  const defaultOffset = options.defaultOffset ?? 0

  const limit = parseIntegerParam(query.limit, 'limit', defaultLimit, {
    min: 1,
    max: maxLimit
  })
  if (limit.error) {
    return { ok: false, error: limit.error }
  }

  const offset = parseIntegerParam(query.offset, 'offset', defaultOffset, {
    min: 0,
    max: Number.MAX_SAFE_INTEGER
  })
  if (offset.error) {
    return { ok: false, error: offset.error }
  }

  return { ok: true, limit: limit.value, offset: offset.value }
}

module.exports = {
  parsePaginationQuery
}

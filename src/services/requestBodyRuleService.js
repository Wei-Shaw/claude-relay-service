const VALID_VALUE_TYPES = ['string', 'number', 'boolean', 'json']

function isNumericSegment(segment) {
  return /^\d+$/.test(segment)
}

function validatePath(path) {
  if (typeof path !== 'string' || !path.trim()) {
    return 'Rule path must be a non-empty string'
  }

  const segments = path.split('.')
  if (segments.some((segment) => !segment.trim())) {
    return 'Rule path cannot contain empty segments'
  }

  return null
}

function normalizeRule(rawRule = {}) {
  if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) {
    return null
  }

  const path = typeof rawRule.path === 'string' ? rawRule.path.trim() : ''
  if (!path) {
    return null
  }

  return {
    path,
    valueType: typeof rawRule.valueType === 'string' ? rawRule.valueType.trim().toLowerCase() : '',
    value: rawRule.value === undefined || rawRule.value === null ? '' : String(rawRule.value)
  }
}

function coerceRuleValue(rule) {
  if (!rule || typeof rule !== 'object') {
    throw new Error('Invalid rule')
  }

  if (rule.value === '') {
    return ''
  }

  switch (rule.valueType) {
    case 'string':
      return rule.value
    case 'number': {
      const parsed = Number(rule.value)
      if (!Number.isFinite(parsed)) {
        throw new Error(`Rule path "${rule.path}" expects a valid number`)
      }
      return parsed
    }
    case 'boolean': {
      const normalized = rule.value.trim().toLowerCase()
      if (normalized !== 'true' && normalized !== 'false') {
        throw new Error(`Rule path "${rule.path}" expects "true" or "false"`)
      }
      return normalized === 'true'
    }
    case 'json':
      try {
        return JSON.parse(rule.value)
      } catch (error) {
        throw new Error(`Rule path "${rule.path}" expects valid JSON`)
      }
    default:
      throw new Error(`Rule path "${rule.path}" has unsupported valueType "${rule.valueType}"`)
  }
}

function validateAndNormalizeRules(rules) {
  if (rules === undefined || rules === null) {
    return { valid: true, rules: [] }
  }

  if (!Array.isArray(rules)) {
    return { valid: false, error: 'Payload rules must be an array' }
  }

  const normalizedRules = []

  for (let i = 0; i < rules.length; i++) {
    const rawRule = rules[i]
    if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) {
      return {
        valid: false,
        error: `Payload rule #${i + 1} must be an object`
      }
    }

    const normalizedRule = normalizeRule(rawRule)
    if (!normalizedRule) {
      continue
    }

    const pathError = validatePath(normalizedRule.path)
    if (pathError) {
      return {
        valid: false,
        error: `Payload rule #${i + 1}: ${pathError}`
      }
    }

    if (!VALID_VALUE_TYPES.includes(normalizedRule.valueType)) {
      return {
        valid: false,
        error: `Payload rule #${i + 1} has invalid valueType`
      }
    }

    try {
      coerceRuleValue(normalizedRule)
    } catch (error) {
      return {
        valid: false,
        error: `Payload rule #${i + 1}: ${error.message}`
      }
    }

    normalizedRules.push(normalizedRule)
  }

  return {
    valid: true,
    rules: normalizedRules
  }
}

function setValueAtPath(node, segments, value) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return value
  }

  const [segment, ...rest] = segments
  const isIndex = isNumericSegment(segment)

  if (isIndex) {
    const index = Number(segment)
    const nextNode = Array.isArray(node) ? [...node] : []

    if (rest.length === 0) {
      nextNode[index] = value
      return nextNode
    }

    nextNode[index] = setValueAtPath(nextNode[index], rest, value)
    return nextNode
  }

  const nextNode = node && typeof node === 'object' && !Array.isArray(node) ? { ...node } : {}

  if (rest.length === 0) {
    nextNode[segment] = value
    return nextNode
  }

  nextNode[segment] = setValueAtPath(nextNode[segment], rest, value)
  return nextNode
}

function applyRules(body, rules) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return body
  }

  const validation = validateAndNormalizeRules(rules)
  if (!validation.valid) {
    const error = new Error(validation.error)
    error.statusCode = 500
    throw error
  }

  let nextBody =
    typeof structuredClone === 'function' ? structuredClone(body) : JSON.parse(JSON.stringify(body))

  for (const rule of validation.rules) {
    nextBody = setValueAtPath(nextBody, rule.path.split('.'), coerceRuleValue(rule))
  }

  return nextBody
}

module.exports = {
  VALID_VALUE_TYPES,
  applyRules,
  coerceRuleValue,
  normalizeRule,
  validateAndNormalizeRules
}

function appendHint(description, hint) {
  if (!hint) {
    return description || ''
  }
  if (!description) {
    return hint
  }
  return `${description} (${hint})`
}

function getRefHint(refValue) {
  const ref = String(refValue || '')
  if (!ref) {
    return ''
  }
  const idx = ref.lastIndexOf('/')
  const name = idx >= 0 ? ref.slice(idx + 1) : ref
  return name ? `See: ${name}` : ''
}

function normalizeType(typeValue) {
  if (typeof typeValue === 'string' && typeValue) {
    return { type: typeValue, hint: '' }
  }
  if (!Array.isArray(typeValue) || typeValue.length === 0) {
    return { type: '', hint: '' }
  }
  const raw = typeValue.map((t) => (t === null || t === undefined ? '' : String(t))).filter(Boolean)
  const hasNull = raw.includes('null')
  const nonNull = raw.filter((t) => t !== 'null')
  const primary = nonNull[0] || 'string'
  const hintParts = []
  if (nonNull.length > 1) {
    hintParts.push(`Accepts: ${nonNull.join(' | ')}`)
  }
  if (hasNull) {
    hintParts.push('nullable')
  }
  return { type: primary, hint: hintParts.join('; ') }
}

const CONSTRAINT_KEYS = [
  'minLength',
  'maxLength',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'pattern',
  'minItems',
  'maxItems'
]

function scoreSchema(schema) {
  if (!schema || typeof schema !== 'object') {
    return { score: 0, type: '' }
  }
  const t = typeof schema.type === 'string' ? schema.type : ''
  if (t === 'object' || (schema.properties && typeof schema.properties === 'object')) {
    return { score: 3, type: t || 'object' }
  }
  if (t === 'array' || schema.items) {
    return { score: 2, type: t || 'array' }
  }
  if (t && t !== 'null') {
    return { score: 1, type: t }
  }
  return { score: 0, type: t || 'null' }
}

function pickBestFromAlternatives(alternatives) {
  let bestIndex = 0
  let bestScore = -1
  const types = []
  for (let i = 0; i < alternatives.length; i += 1) {
    const alt = alternatives[i]
    const { score, type } = scoreSchema(alt)
    if (type) {
      types.push(type)
    }
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }
  return { best: alternatives[bestIndex], types: Array.from(new Set(types)).filter(Boolean) }
}

function cleanJsonSchemaForGemini(schema) {
  if (schema === null || schema === undefined) {
    return { type: 'object', properties: {} }
  }
  if (typeof schema !== 'object') {
    return { type: 'object', properties: {} }
  }
  if (Array.isArray(schema)) {
    return { type: 'object', properties: {} }
  }

  // $ref：Gemini/Antigravity 不支持，转换为 hint
  if (typeof schema.$ref === 'string' && schema.$ref) {
    return {
      type: 'object',
      description: appendHint(schema.description || '', getRefHint(schema.$ref)),
      properties: {}
    }
  }

  // anyOf / oneOf：选择最可能的 schema，保留类型提示
  const anyOf = Array.isArray(schema.anyOf) ? schema.anyOf : null
  const oneOf = Array.isArray(schema.oneOf) ? schema.oneOf : null
  const alts = anyOf && anyOf.length ? anyOf : oneOf && oneOf.length ? oneOf : null
  if (alts) {
    const { best, types } = pickBestFromAlternatives(alts)
    const cleaned = cleanJsonSchemaForGemini(best)
    const mergedDescription = appendHint(cleaned.description || '', schema.description || '')
    const typeHint = types.length > 1 ? `Accepts: ${types.join(' || ')}` : ''
    return {
      ...cleaned,
      description: appendHint(mergedDescription, typeHint)
    }
  }

  // allOf：合并 properties/required
  if (Array.isArray(schema.allOf) && schema.allOf.length) {
    const merged = {}
    let mergedDesc = schema.description || ''
    const mergedReq = new Set()
    const mergedProps = {}
    for (const item of schema.allOf) {
      const cleaned = cleanJsonSchemaForGemini(item)
      if (cleaned.description) {
        mergedDesc = appendHint(mergedDesc, cleaned.description)
      }
      if (Array.isArray(cleaned.required)) {
        for (const r of cleaned.required) {
          if (typeof r === 'string' && r) {
            mergedReq.add(r)
          }
        }
      }
      if (cleaned.properties && typeof cleaned.properties === 'object') {
        Object.assign(mergedProps, cleaned.properties)
      }
      if (cleaned.type && !merged.type) {
        merged.type = cleaned.type
      }
      if (cleaned.items && !merged.items) {
        merged.items = cleaned.items
      }
      if (Array.isArray(cleaned.enum) && !merged.enum) {
        merged.enum = cleaned.enum
      }
    }
    if (Object.keys(mergedProps).length) {
      merged.type = merged.type || 'object'
      merged.properties = mergedProps
      const req = Array.from(mergedReq).filter((r) => mergedProps[r])
      if (req.length) {
        merged.required = req
      }
    }
    if (mergedDesc) {
      merged.description = mergedDesc
    }
    return cleanJsonSchemaForGemini(merged)
  }

  const result = {}
  const constraintHints = []

  // description
  if (typeof schema.description === 'string') {
    result.description = schema.description
  }

  for (const key of CONSTRAINT_KEYS) {
    const value = schema[key]
    if (value === undefined || value === null || typeof value === 'object') {
      continue
    }
    constraintHints.push(`${key}: ${value}`)
  }

  // const -> enum
  if (schema.const !== undefined && !Array.isArray(schema.enum)) {
    result.enum = [schema.const]
  }

  // enum
  if (Array.isArray(schema.enum)) {
    const en = schema.enum.filter(
      (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    )
    if (en.length) {
      result.enum = en
    }
  }

  // type（flatten 数组 type）
  const { type: normalizedType, hint: typeHint } = normalizeType(schema.type)
  if (normalizedType) {
    result.type = normalizedType
  }
  if (typeHint) {
    result.description = appendHint(result.description || '', typeHint)
  }

  if (result.enum && result.enum.length > 1 && result.enum.length <= 10) {
    const list = result.enum.map((item) => String(item)).join(', ')
    result.description = appendHint(result.description || '', `Allowed: ${list}`)
  }

  if (constraintHints.length) {
    result.description = appendHint(result.description || '', constraintHints.join(', '))
  }

  // additionalProperties：Gemini/Antigravity 不接受布尔值，直接删除并用 hint 记录
  if (schema.additionalProperties === false) {
    result.description = appendHint(result.description || '', 'No extra properties allowed')
  }

  // properties
  if (
    schema.properties &&
    typeof schema.properties === 'object' &&
    !Array.isArray(schema.properties)
  ) {
    const props = {}
    for (const [name, propSchema] of Object.entries(schema.properties)) {
      props[name] = cleanJsonSchemaForGemini(propSchema)
    }
    result.type = result.type || 'object'
    result.properties = props
  }

  // items
  if (schema.items !== undefined) {
    result.type = result.type || 'array'
    result.items = cleanJsonSchemaForGemini(schema.items)
  }

  // required（最后再清理无效字段）
  if (Array.isArray(schema.required) && result.properties) {
    const req = schema.required.filter(
      (r) =>
        typeof r === 'string' && r && Object.prototype.hasOwnProperty.call(result.properties, r)
    )
    if (req.length) {
      result.required = req
    }
  }

  // 只保留 Gemini 兼容字段：其他（$schema/$id/$defs/definitions/format/constraints/pattern...）一律丢弃

  if (!result.type) {
    result.type = result.properties ? 'object' : result.items ? 'array' : 'object'
  }
  if (result.type === 'object' && !result.properties) {
    result.properties = {}
  }
  return result
}

module.exports = {
  cleanJsonSchemaForGemini
}

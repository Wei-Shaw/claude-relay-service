function normalizeDisplayModel(model) {
  if (typeof model !== 'string') {
    return null
  }

  const trimmed = model.trim()
  return trimmed || null
}

function setModelField(container, displayModel) {
  if (!container || typeof container !== 'object' || Array.isArray(container)) {
    return false
  }

  if (typeof container.model !== 'string' || container.model === displayModel) {
    return false
  }

  container.model = displayModel
  return true
}

function rewriteModelFieldsForClient(data, displayModel) {
  const clientModel = normalizeDisplayModel(displayModel)
  if (!clientModel || !data || typeof data !== 'object' || Array.isArray(data)) {
    return { changed: false, data }
  }

  let changed = false
  changed = setModelField(data, clientModel) || changed
  changed = setModelField(data.message, clientModel) || changed
  changed = setModelField(data.response, clientModel) || changed

  return { changed, data }
}

function rewriteSsePayloadModels(payload, displayModel) {
  const clientModel = normalizeDisplayModel(displayModel)
  if (!clientModel || typeof payload !== 'string' || !payload.includes('data:')) {
    return payload
  }

  const lines = payload.split('\n')
  let changed = false

  const rewrittenLines = lines.map((line) => {
    if (!line.startsWith('data:')) {
      return line
    }

    const jsonStr = line.slice(5).trimStart()
    if (!jsonStr || jsonStr === '[DONE]') {
      return line
    }

    try {
      const parsed = JSON.parse(jsonStr)
      const result = rewriteModelFieldsForClient(parsed, clientModel)
      if (!result.changed) {
        return line
      }

      changed = true
      return `data: ${JSON.stringify(result.data)}`
    } catch {
      return line
    }
  })

  return changed ? rewrittenLines.join('\n') : payload
}

module.exports = {
  normalizeDisplayModel,
  rewriteModelFieldsForClient,
  rewriteSsePayloadModels
}

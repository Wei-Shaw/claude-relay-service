const BEDROCK_REGION_PATTERN = /^[a-z]{2,8}(?:-[a-z0-9]+)+-\d+$/

const RETIRED_BEDROCK_MODEL_MARKERS = ['claude-3-5-haiku']

function createBedrockValidationError(message, code) {
  const error = new Error(message)
  error.code = code
  error.statusCode = 400
  return error
}

function normalizeBedrockRegion(region, fallback = null) {
  const value = region === undefined || region === null || region === '' ? fallback : region
  if (typeof value !== 'string' || value.trim() === '') {
    throw createBedrockValidationError('AWS Region is required', 'INVALID_BEDROCK_REGION')
  }

  const normalized = value.trim().toLowerCase()
  if (!BEDROCK_REGION_PATTERN.test(normalized)) {
    throw createBedrockValidationError(
      `Invalid AWS Region: ${normalized}`,
      'INVALID_BEDROCK_REGION'
    )
  }

  return normalized
}

function normalizeBedrockModel(model) {
  if (typeof model !== 'string' || model.trim() === '') {
    throw createBedrockValidationError('Bedrock model is required', 'INVALID_BEDROCK_MODEL')
  }
  return model.trim()
}

function isRetiredBedrockModel(model) {
  if (typeof model !== 'string') {
    return false
  }
  return RETIRED_BEDROCK_MODEL_MARKERS.some((marker) => model.includes(marker))
}

function assertSupportedBedrockModel(model) {
  const normalized = normalizeBedrockModel(model)
  if (isRetiredBedrockModel(normalized)) {
    throw createBedrockValidationError(
      `Bedrock model ${normalized} is retired; select a current model such as Claude Haiku 4.5`,
      'RETIRED_BEDROCK_MODEL'
    )
  }
  return normalized
}

module.exports = {
  BEDROCK_REGION_PATTERN,
  RETIRED_BEDROCK_MODEL_MARKERS,
  normalizeBedrockRegion,
  normalizeBedrockModel,
  isRetiredBedrockModel,
  assertSupportedBedrockModel
}

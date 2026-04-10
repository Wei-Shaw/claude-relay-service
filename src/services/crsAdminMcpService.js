const axios = require('axios')

const { adminAgentOpenApiSpec } = require('../openapi/adminAgentSpec')

const DEFAULT_SERVER_NAME = 'crs-admin'
const GENERIC_TOOL_INPUT_SCHEMA = {
  path: {
    type: 'object',
    description: 'Path parameters keyed by OpenAPI path variable name',
    additionalProperties: true
  },
  query: {
    type: 'object',
    description: 'Query string parameters keyed by OpenAPI parameter name',
    additionalProperties: true
  },
  body: {
    description: 'JSON request body that matches the current admin endpoint'
  }
}

class CrsAdminMcpError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'CrsAdminMcpError'
    this.code = options.code || 'CRS_ADMIN_MCP_ERROR'
    this.statusCode = options.statusCode || 500
    this.summary = options.summary || message
    this.cause = options.cause
  }
}

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const SAFE_STATUS_MESSAGES = {
  400: 'Invalid request',
  401: 'Authentication failed',
  403: 'Permission denied',
  404: 'Resource not found',
  429: 'Rate limit exceeded',
  500: 'Internal server error',
  502: 'Upstream service error',
  503: 'Service temporarily unavailable',
  504: 'Request timeout',
  529: 'Server overloaded'
}

const NETWORK_ERROR_CODES = ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'EPERM']

const getDerivedStatusCode = (error) => {
  const statusCode = error?.response?.status || error?.statusCode || error?.status
  if (statusCode) {
    return statusCode
  }

  const errorCode = String(error?.code || error?.cause?.code || '').toUpperCase()
  if (NETWORK_ERROR_CODES.includes(errorCode)) {
    return 503
  }

  return 500
}

const getSanitizedSummary = (error) => {
  const statusCode = getDerivedStatusCode(error)
  if (statusCode && SAFE_STATUS_MESSAGES[statusCode]) {
    return SAFE_STATUS_MESSAGES[statusCode]
  }

  const errorCode = String(error?.code || error?.cause?.code || '').toUpperCase()
  if (NETWORK_ERROR_CODES.includes(errorCode)) {
    return SAFE_STATUS_MESSAGES[503]
  }

  const message = String(
    error?.message ||
      error?.response?.data?.message ||
      error?.response?.data?.error?.message ||
      error?.response?.data?.error ||
      ''
  )

  if (/timeout|ETIMEDOUT/i.test(message)) {
    return SAFE_STATUS_MESSAGES[504]
  }
  if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|network/i.test(message)) {
    return SAFE_STATUS_MESSAGES[503]
  }
  if (/forbidden|permission/i.test(message)) {
    return SAFE_STATUS_MESSAGES[403]
  }
  if (/not found|404/i.test(message)) {
    return SAFE_STATUS_MESSAGES[404]
  }
  if (/rate limit|too many requests|429/i.test(message)) {
    return SAFE_STATUS_MESSAGES[429]
  }
  if (/unauthorized|invalid.*token|token.*invalid|auth/i.test(message)) {
    return SAFE_STATUS_MESSAGES[401]
  }
  if (/overloaded|529/i.test(message)) {
    return SAFE_STATUS_MESSAGES[529]
  }
  if (/bad gateway|upstream|502/i.test(message)) {
    return SAFE_STATUS_MESSAGES[502]
  }
  if (/service unavailable|503/i.test(message)) {
    return SAFE_STATUS_MESSAGES[503]
  }
  if (/invalid request|bad request|malformed|400/i.test(message)) {
    return SAFE_STATUS_MESSAGES[400]
  }

  return SAFE_STATUS_MESSAGES[500]
}

const hasAdminBearerSecurity = (operation) => {
  const effectiveSecurity = operation.security ?? adminAgentOpenApiSpec.security ?? []
  return effectiveSecurity.some(
    (item) => item && Object.prototype.hasOwnProperty.call(item, 'AdminBearerAuth')
  )
}

const normalizeParameters = (parameters = []) =>
  parameters.map((parameter) => ({
    name: parameter.name,
    in: parameter.in,
    required: parameter.required === true,
    schema: parameter.schema || {}
  }))

const buildOperationDescriptor = (pathTemplate, method, operation) => {
  const parameters = normalizeParameters(operation.parameters)
  const pathParameters = parameters.filter((parameter) => parameter.in === 'path')
  const queryParameters = parameters.filter((parameter) => parameter.in === 'query')

  return {
    operationId: operation.operationId,
    method: method.toUpperCase(),
    pathTemplate,
    summary: operation.summary || '',
    description: operation.description || '',
    hasRequestBody: Boolean(operation.requestBody),
    pathParameters,
    queryParameters
  }
}

const getExposedOperations = () => {
  const operations = []

  for (const [pathTemplate, pathItem] of Object.entries(adminAgentOpenApiSpec.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!operation?.operationId) {
        continue
      }
      if (operation.operationId === 'adminLogin') {
        continue
      }
      if (!hasAdminBearerSecurity(operation)) {
        continue
      }

      operations.push(buildOperationDescriptor(pathTemplate, method, operation))
    }
  }

  return operations.sort((left, right) => left.operationId.localeCompare(right.operationId))
}

const getOperationMap = () =>
  new Map(getExposedOperations().map((operation) => [operation.operationId, operation]))

const getDefaultBaseUrl = () => {
  if (process.env.CRS_BASE_URL) {
    return process.env.CRS_BASE_URL
  }

  const { PORT: port = '3000' } = process.env
  return `http://127.0.0.1:${port}`
}

const assertObjectArgs = (value, fieldName) => {
  if (value === undefined) {
    return {}
  }
  if (!isPlainObject(value)) {
    throw new CrsAdminMcpError(`${fieldName} must be an object`, {
      code: 'INVALID_INPUT',
      statusCode: 400,
      summary: `${fieldName} must be an object`
    })
  }
  return value
}

const resolvePathTemplate = (operation, pathArgs) => {
  let resolvedPath = operation.pathTemplate

  for (const parameter of operation.pathParameters) {
    const rawValue = pathArgs[parameter.name]
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      throw new CrsAdminMcpError(`Missing required path parameter: ${parameter.name}`, {
        code: 'MISSING_PATH_PARAMETER',
        statusCode: 400,
        summary: `Missing required path parameter: ${parameter.name}`
      })
    }
    resolvedPath = resolvedPath.replace(`{${parameter.name}}`, encodeURIComponent(String(rawValue)))
  }

  return resolvedPath
}

const assertNonEmptyKeyIds = (operationId, body) => {
  if (!isPlainObject(body)) {
    return
  }

  if (Array.isArray(body.keyIds) && body.keyIds.length === 0) {
    throw new CrsAdminMcpError(`body.keyIds must not be empty for ${operationId}`, {
      code: 'EMPTY_KEY_IDS',
      statusCode: 400,
      summary: 'body.keyIds must not be empty'
    })
  }
}

const getOperationById = (operationId) => {
  const operation = getOperationMap().get(operationId)
  if (!operation) {
    throw new CrsAdminMcpError(`Unknown CRS admin MCP operation: ${operationId}`, {
      code: 'UNKNOWN_OPERATION',
      statusCode: 404,
      summary: `Unknown operation: ${operationId}`
    })
  }
  return operation
}

const buildToolDescription = (operation) => {
  const parts = []

  if (operation.summary) {
    parts.push(operation.summary)
  }
  if (operation.description && operation.description !== operation.summary) {
    parts.push(operation.description)
  }

  parts.push(`HTTP ${operation.method} ${operation.pathTemplate}`)
  parts.push('Input shape: { path?: {...}, query?: {...}, body?: {...} }')

  return parts.join('\n')
}

const createSuccessToolResult = (data) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify(data, null, 2)
    }
  ],
  structuredContent: data
})

const createToolErrorResult = (operationId, error) => {
  const statusCode =
    error instanceof CrsAdminMcpError ? error.statusCode : getDerivedStatusCode(error)
  const summary = error instanceof CrsAdminMcpError ? error.summary : getSanitizedSummary(error)

  const payload = {
    operationId,
    statusCode,
    error: summary
  }

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2)
      }
    ],
    structuredContent: payload
  }
}

const resolveAdminToken = (options = {}) => {
  if (options.adminToken) {
    return options.adminToken
  }

  if (process.env.CRS_ADMIN_TOKEN) {
    return process.env.CRS_ADMIN_TOKEN
  }

  throw new CrsAdminMcpError('Missing CRS_ADMIN_TOKEN environment variable', {
    code: 'MISSING_ADMIN_TOKEN',
    statusCode: 401,
    summary: 'Missing CRS_ADMIN_TOKEN environment variable'
  })
}

const invokeOperation = async (operationId, args = {}, options = {}) => {
  const operation = getOperationById(operationId)
  const token = resolveAdminToken(options)
  const baseURL = options.baseURL || getDefaultBaseUrl()

  const normalizedArgs = isPlainObject(args) ? args : {}
  const pathArgs = assertObjectArgs(normalizedArgs.path, 'path')
  const queryArgs = assertObjectArgs(normalizedArgs.query, 'query')
  const { body } = normalizedArgs

  assertNonEmptyKeyIds(operationId, body)

  const response = await axios
    .request({
      baseURL,
      url: resolvePathTemplate(operation, pathArgs),
      method: operation.method,
      params: queryArgs,
      data: operation.hasRequestBody ? body : undefined,
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    .catch((error) => {
      const statusCode = getDerivedStatusCode(error)
      const safeMessage = getSanitizedSummary(error)

      throw new CrsAdminMcpError(`CRS admin request failed: ${operationId}`, {
        code: 'UPSTREAM_REQUEST_FAILED',
        statusCode,
        summary: safeMessage,
        cause: error
      })
    })

  const { data } = response
  return data
}

module.exports = {
  DEFAULT_SERVER_NAME,
  GENERIC_TOOL_INPUT_SCHEMA,
  CrsAdminMcpError,
  buildToolDescription,
  createSuccessToolResult,
  createToolErrorResult,
  getDefaultBaseUrl,
  getExposedOperations,
  getOperationById,
  invokeOperation,
  resolveAdminToken
}

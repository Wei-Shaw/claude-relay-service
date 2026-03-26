const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { z } = require('zod')

const pkg = require('../../package.json')
const {
  DEFAULT_SERVER_NAME,
  buildToolDescription,
  createSuccessToolResult,
  createToolErrorResult,
  getExposedOperations,
  invokeOperation
} = require('./crsAdminMcpService')

const GENERIC_TOOL_INPUT_SHAPE = {
  path: z.record(z.any()).optional().describe('Path parameters object'),
  query: z.record(z.any()).optional().describe('Query parameters object'),
  body: z.any().optional().describe('JSON request body')
}

const createCrsAdminMcpServer = (options = {}) => {
  const server = new McpServer({
    name: DEFAULT_SERVER_NAME,
    version: options.version || pkg.version
  })

  for (const operation of getExposedOperations()) {
    server.tool(
      operation.operationId,
      buildToolDescription(operation),
      GENERIC_TOOL_INPUT_SHAPE,
      async (args = {}) => {
        try {
          const data = await invokeOperation(operation.operationId, args, options)
          return createSuccessToolResult(data)
        } catch (error) {
          return createToolErrorResult(operation.operationId, error)
        }
      }
    )
  }

  return server
}

module.exports = {
  createCrsAdminMcpServer,
  GENERIC_TOOL_INPUT_SHAPE
}

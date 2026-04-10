import { createRequire } from 'node:module'

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const require = createRequire(import.meta.url)

const { createCrsAdminMcpServer } = require('../src/services/crsAdminMcpServerFactory')

const server = createCrsAdminMcpServer()

const transport = new StdioServerTransport()

server.connect(transport).catch((error) => {
  console.error('[crs-admin-mcp] Failed to start MCP server:', error)
  process.exit(1)
})

const express = require('express')
const {
  StreamableHTTPServerTransport
} = require('@modelcontextprotocol/sdk/server/streamableHttp.js')

const { authenticateAdmin } = require('../../middleware/auth')
const { createCrsAdminMcpServer } = require('../../services/crsAdminMcpServerFactory')
const logger = require('../../utils/logger')

const router = express.Router()

const methodNotAllowed = (req, res) => {
  res.set('Allow', 'POST')
  return res.status(405).send('Method Not Allowed')
}

router.get('/mcp', methodNotAllowed)
router.delete('/mcp', methodNotAllowed)

router.post('/mcp', authenticateAdmin, async (req, res) => {
  const server = createCrsAdminMcpServer({
    adminToken: req.admin?.sessionId
  })
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  })

  let cleanedUp = false
  const cleanup = async () => {
    if (cleanedUp) {
      return
    }
    cleanedUp = true

    await Promise.allSettled([transport.close(), server.close()])
  }

  res.once('finish', () => {
    cleanup().catch((error) => {
      logger.error('Failed to cleanup remote admin MCP transport on finish:', error)
    })
  })
  res.once('close', () => {
    cleanup().catch((error) => {
      logger.error('Failed to cleanup remote admin MCP transport on close:', error)
    })
  })

  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    logger.error('Failed to handle remote admin MCP request:', {
      error: error.message,
      url: req.originalUrl,
      admin: req.admin?.username || 'unknown'
    })

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: req.body?.id ?? null
      })
    }
  }
})

module.exports = router

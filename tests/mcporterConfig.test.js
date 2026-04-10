const fs = require('fs')
const path = require('path')

describe('mcporter config', () => {
  it('keeps the local stdio crs-admin entry for repository development', () => {
    const configPath = path.join(__dirname, '../config/mcporter.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

    expect(config).toHaveProperty('mcpServers.crs-admin')
    expect(config.mcpServers['crs-admin']).toEqual({
      command: 'node ../scripts/crs-admin-mcp.mjs'
    })
  })
})

#!/usr/bin/env node

require('dotenv').config()

const postgres = require('../src/models/postgres')
const usagePostgresStore = require('../src/services/usageStores/postgresUsageStore')

async function main() {
  try {
    const reset = process.argv.includes('--reset')
    if (reset) {
      await usagePostgresStore.resetSchema()
      console.log('✅ usage PostgreSQL schema was reset and recreated')
    } else {
      await usagePostgresStore.ensureSchema()
      console.log('✅ usage PostgreSQL schema is ready')
    }
  } finally {
    await postgres.close()
  }
}

main().catch((error) => {
  console.error(`❌ Failed to initialize usage PostgreSQL schema: ${error.message}`)
  process.exit(1)
})

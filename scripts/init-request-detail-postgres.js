#!/usr/bin/env node

require('dotenv').config()

const postgres = require('../src/models/postgres')
const requestDetailPostgresStore = require('../src/services/requestDetailStores/postgresRequestDetailStore')

async function main() {
  try {
    const reset = process.argv.includes('--reset')
    if (reset) {
      await requestDetailPostgresStore.resetSchema()
      console.log('✅ request detail PostgreSQL split schema was reset and recreated')
    } else {
      await requestDetailPostgresStore.ensureSchema()
      console.log('✅ request detail PostgreSQL split schema is ready')
    }
  } finally {
    await postgres.close()
  }
}

main().catch((error) => {
  console.error(`❌ Failed to initialize request_details PostgreSQL schema: ${error.message}`)
  process.exit(1)
})

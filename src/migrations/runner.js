const logger = require('../utils/logger')
const { getAppVersion, versionGt } = require('../utils/commonHelper')

const ledger = require('./ledger')
const { registry } = require('./registry')

// 首次接管:把存量等价旧 marker 平滑导入 applied 台账(只读旧 marker,绝不删)。
// per-migration 判断(不用全局 guard):将来新增带 legacyMarkerKey 的迁移,其存量旧 marker 仍会被接管。
const importLegacyMarkers = async (client) => {
  for (const migration of registry) {
    if (!migration.legacyMarkerKey) {
      continue
    }
    if (await ledger.isApplied(client, migration.id)) {
      continue
    }
    const legacyValue = await client.get(migration.legacyMarkerKey)
    if (legacyValue) {
      await ledger.markApplied(client, migration.id, legacyValue)
    }
  }
}

// 版本门控块:逐字复刻 src/app.js 原版本门控迁移
// system:migrated:version 水位语义不变,不进 applied 台账;global_stats 由 needsGlobalStatsMigration 按需自愈
const runVersionGated = async (redis) => {
  const currentVersion = getAppVersion()
  const migratedVersion = await redis.getMigratedVersion()
  if (versionGt(currentVersion, '1.1.250') && versionGt(currentVersion, migratedVersion)) {
    logger.info(`🔄 检测到新版本 ${currentVersion}，检查数据迁移...`)
    try {
      if (await redis.needsGlobalStatsMigration()) {
        await redis.migrateGlobalStats()
      }
      await redis.cleanupSystemMetrics()
    } catch (err) {
      logger.error('⚠️ 数据迁移出错，但不影响启动:', err)
    }
    await redis.setMigratedVersion(currentVersion)
    logger.success(`✅ 数据迁移完成，版本: ${currentVersion}`)
  }
}

// marker 型一次性迁移:首次接管存量 → 查台账 → 未应用则跑 → 登记
// 契约(见 registry.js):up 失败【必须抛错】。up 抛错时不执行 markApplied,下次重试;吞错的迁移不要进 registry。
const runMarker = async (redis, id) => {
  const client = redis.getClientSafe()
  await importLegacyMarkers(client)
  if (await ledger.isApplied(client, id)) {
    return
  }
  const migration = registry.find((item) => item.id === id)
  if (!migration) {
    throw new Error(`Unknown migration: ${id}`)
  }
  logger.info(`🔄 运行一次性迁移 ${id}...`)
  // up 必须幂等可重入且失败抛错(见 registry.js 契约);抛错 → 跳过 markApplied → 下次重跑
  await migration.up(redis)
  // applied 台账是去重优化:写失败不中断启动,下次重跑 up(契约要求 up 幂等,故重跑无害)
  try {
    await ledger.markApplied(client, id, Date.now())
    logger.success(`✅ 一次性迁移 ${id} 完成`)
  } catch (e) {
    logger.error(`⚠️ 迁移 ${id} 完成但台账写入失败(下次将重跑,依赖 up 幂等):`, e)
  }
}

module.exports = { runVersionGated, runMarker, importLegacyMarkers }

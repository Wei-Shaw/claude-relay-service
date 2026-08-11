// 迁移台账:记录 marker 型一次性迁移的应用状态
// system:migrations:applied (Hash): migrationId -> 完成时间戳(字符串)
//
// 用途:记录已成功执行的 marker 型迁移,启动时据此跳过重复执行(去重优化,非"恰好一次"——up 须幂等,见 registry.js 契约)。
// 版本门控块(migrateGlobalStats / cleanupSystemMetrics)走 system:migrated:version 水位、不在此台账:
// 那是"版本升级才检查"的独立机制,与本台账的去重优化各管各的。

const { RedisKeys } = require('../constants/redisKeys')

const LEDGER_KEY = RedisKeys.system.migrationsApplied

const isApplied = async (client, id) => (await client.hexists(LEDGER_KEY, id)) === 1

const markApplied = async (client, id, completedAt) =>
  client.hset(LEDGER_KEY, id, String(completedAt))

const getAll = async (client) => client.hgetall(LEDGER_KEY)

module.exports = { LEDGER_KEY, isApplied, markApplied, getAll }

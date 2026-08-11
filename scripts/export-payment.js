#!/usr/bin/env node
// 支付子集导出：订单 / 审计 / 商品 / 渠道实例 / 全局配置 / 余额账本。
// 用途：Redis 硬化备份（支付证据）；不解密渠道密钥字段的密文原样导出。
// 用法：node scripts/export-payment.js [outDir]
// 环境：依赖项目 .env 的 REDIS_* / ENCRYPTION_KEY（与主服务一致）

'use strict'

const fs = require('fs')
const path = require('path')

// 启动引导：与其它 scripts 一致，先加载 env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const redis = require('../src/models/redis')
const { RedisKeys } = require('../src/constants/redisKeys')

const outDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(
      __dirname,
      '..',
      'data',
      `payment-export-${new Date().toISOString().replace(/[:.]/g, '-')}`
    )

const writeJson = (name, data) => {
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(data, null, 2), 'utf8')
  console.log(`[export-payment] wrote ${name}`)
}

const main = async () => {
  fs.mkdirSync(outDir, { recursive: true })
  await redis.connect()

  // 配置
  const configRaw = await redis.client.get(RedisKeys.payment.config)
  writeJson('config.json', configRaw ? JSON.parse(configRaw) : null)

  // 商品
  const planIds = await redis.client.smembers(RedisKeys.payment.plansAll)
  const plans = []
  for (const id of planIds) {
    const h = await redis.client.hgetall(RedisKeys.payment.plan(id))
    if (h && Object.keys(h).length) {
      plans.push(h)
    }
  }
  writeJson('plans.json', plans)

  // 渠道实例（config 字段为 AES 密文，原样导出，不解密）
  const providerIds = await redis.client.smembers(RedisKeys.payment.providersAll)
  const providers = []
  for (const id of providerIds) {
    const h = await redis.client.hgetall(RedisKeys.payment.provider(id))
    if (h && Object.keys(h).length) {
      providers.push(h)
    }
  }
  writeJson('providers.json', providers)

  // 订单（倒序全量）
  const orderIds = await redis.client.zrevrange(RedisKeys.payment.orderIdxCreated, 0, -1)
  const orders = []
  const audits = {}
  const PIPE = 100
  for (let i = 0; i < orderIds.length; i += PIPE) {
    const chunk = orderIds.slice(i, i + PIPE)
    const pipeline = redis.client.pipeline()
    for (const id of chunk) {
      pipeline.hgetall(RedisKeys.payment.order(id))
    }
    const results = await pipeline.exec()
    for (let j = 0; j < chunk.length; j++) {
      const data = results[j] && results[j][1]
      if (data && Object.keys(data).length) {
        orders.push(data)
      }
    }
    // 审计
    const auditPipe = redis.client.pipeline()
    for (const id of chunk) {
      auditPipe.lrange(RedisKeys.payment.audit(id), 0, -1)
    }
    const auditResults = await auditPipe.exec()
    for (let j = 0; j < chunk.length; j++) {
      const items = (auditResults[j] && auditResults[j][1]) || []
      if (items.length) {
        audits[chunk[j]] = items.map((s) => {
          try {
            return JSON.parse(s)
          } catch (e) {
            return s
          }
        })
      }
    }
  }
  writeJson('orders.json', orders)
  writeJson('audits.json', audits)

  // 余额账本：扫 credit key 前缀；同时导出 applied/reversed/tx（退款幂等与回滚依赖）
  const balances = []
  let cursor = '0'
  do {
    const [next, keys] = await redis.client.scan(
      cursor,
      'MATCH',
      'payment:balance:credit:*',
      'COUNT',
      200
    )
    cursor = next
    for (const key of keys) {
      const keyId = key.replace('payment:balance:credit:', '')
      const [credit, refunded, baseline, applied, reversed, tx] = await Promise.all([
        redis.client.get(RedisKeys.payment.balanceCredit(keyId)),
        redis.client.get(RedisKeys.payment.balanceRefunded(keyId)),
        redis.client.get(RedisKeys.payment.balanceBaseline(keyId)),
        redis.client.smembers(RedisKeys.payment.balanceApplied(keyId)),
        redis.client.hgetall(RedisKeys.payment.balanceReversed(keyId)),
        redis.client.lrange(RedisKeys.payment.balanceTx(keyId), 0, -1)
      ])
      balances.push({
        keyId,
        credit: credit || '0',
        refunded: refunded || '0',
        baseline: baseline || '',
        applied: applied || [],
        reversed: reversed || {},
        tx: (tx || []).map((line) => {
          try {
            return JSON.parse(line)
          } catch (e) {
            return line
          }
        })
      })
    }
  } while (cursor !== '0')
  writeJson('balances.json', balances)

  writeJson('meta.json', {
    exportedAt: new Date().toISOString(),
    orderCount: orders.length,
    planCount: plans.length,
    providerCount: providers.length,
    balanceCount: balances.length,
    note:
      'provider.config 为 AES 密文；恢复需同 ENCRYPTION_KEY。' +
      'balances 含 credit/refunded/baseline/applied/reversed/tx，可支撑退款幂等与 unreverse 恢复。' +
      '订单/审计 key 无 TTL，本导出作灾备。'
  })

  console.log(`[export-payment] done → ${outDir}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

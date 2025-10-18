#!/usr/bin/env node

/**
 * 计费事件测试脚本
 *
 * 用于测试计费事件的发布和消费功能
 *
 * 使用方法:
 * node scripts/test-billing-events.js [command]
 *
 * 命令:
 *   publish      - 发布测试事件
 *   consume      - 消费事件（测试模式）
 *   info         - 查看队列状态
 *   clear        - 清空队列（危险操作）
 */

const path = require('path')
const Redis = require('ioredis')

// 加载配置
require('dotenv').config({ path: path.join(__dirname, '../.env') })

const config = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || '',
  db: parseInt(process.env.REDIS_DB) || 0
}

const redis = new Redis(config)
const STREAM_KEY = 'billing:events'

// ========================================
// 命令实现
// ========================================

/**
 * 发布测试事件
 */
async function publishTestEvent() {
  console.log('📤 Publishing test billing event...')

  const testEvent = {
    eventId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    eventType: 'usage.recorded',
    timestamp: new Date().toISOString(),
    version: '1.0',
    apiKeyInfo: {
      id: 'test-key-123',
      name: 'Test API Key',
      apiKey: 'cr_test_********************************'
    },
    usage: {
      model: 'claude-sonnet-4-20250514',
      inputTokens: 1500,
      outputTokens: 800,
      cacheCreateTokens: 200,
      cacheReadTokens: 100,
      ephemeral5mTokens: 150,
      ephemeral1hTokens: 50,
      totalTokens: 2600
    },
    cost: {
      total: 0.0156,
      currency: 'USD',
      breakdown: {
        input: 0.0045,
        output: 0.012,
        cacheCreate: 0.00075,
        cacheRead: 0.00003,
        ephemeral5m: 0.0005625,
        ephemeral1h: 0.0001875
      }
    },
    account: {
      id: 'test-account-789',
      type: 'claude-official'
    },
    context: {
      isLongContext: false,
      requestTimestamp: new Date().toISOString()
    }
  }

  try {
    const messageId = await redis.xadd(
      STREAM_KEY,
      'MAXLEN',
      '~',
      100000,
      '*',
      'data',
      JSON.stringify(testEvent)
    )

    console.log('✅ Event published successfully!')
    console.log(`   Message ID: ${messageId}`)
    console.log(`   Event ID: ${testEvent.eventId}`)
    console.log(`   Cost: $${testEvent.cost.total}`)
  } catch (error) {
    console.error('❌ Failed to publish event:', error.message)
    process.exit(1)
  }
}

/**
 * 消费事件（测试模式，不创建消费者组）
 */
async function consumeTestEvents() {
  console.log('📬 Consuming test events...')
  console.log('   Press Ctrl+C to stop\n')

  let isRunning = true

  process.on('SIGINT', () => {
    console.log('\n⏹️  Stopping consumer...')
    isRunning = false
  })

  let lastId = '0' // 从头开始

  while (isRunning) {
    try {
      // 使用 XREAD 而不是 XREADGROUP（测试模式）
      const messages = await redis.xread('BLOCK', 5000, 'COUNT', 10, 'STREAMS', STREAM_KEY, lastId)

      if (!messages || messages.length === 0) {
        continue
      }

      const [streamKey, entries] = messages[0]
      console.log(`📬 Received ${entries.length} messages from ${streamKey}\n`)

      for (const [messageId, fields] of entries) {
        try {
          const data = {}
          for (let i = 0; i < fields.length; i += 2) {
            data[fields[i]] = fields[i + 1]
          }

          const event = JSON.parse(data.data)

          console.log(`📊 Event: ${event.eventId}`)
          console.log(
            `   API Key: ${event.apiKeyInfo?.name || 'N/A'} (${event.apiKeyInfo?.id || 'N/A'})`
          )
          console.log(`   Model: ${event.usage.model}`)
          console.log(`   Tokens: ${event.usage.totalTokens}`)
          console.log(`   Cost: $${event.cost.total.toFixed(6)}`)
          console.log(`   Timestamp: ${event.timestamp}`)
          console.log('')

          lastId = messageId // 更新位置
        } catch (parseError) {
          console.error(`❌ Failed to parse message ${messageId}:`, parseError.message)
        }
      }
    } catch (error) {
      if (isRunning) {
        console.error('❌ Error consuming messages:', error.message)
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
  }

  console.log('👋 Consumer stopped')
}

/**
 * 查看队列状态
 */
async function showQueueInfo() {
  console.log('📊 Queue Information\n')

  try {
    // Stream 长度
    const length = await redis.xlen(STREAM_KEY)
    console.log(`Stream: ${STREAM_KEY}`)
    console.log(`Length: ${length} messages\n`)

    if (length === 0) {
      console.log('ℹ️  Queue is empty')
      return
    }

    // Stream 详细信息
    const info = await redis.xinfo('STREAM', STREAM_KEY)
    const infoObj = {}
    for (let i = 0; i < info.length; i += 2) {
      infoObj[info[i]] = info[i + 1]
    }

    console.log('Stream Details:')
    console.log(`  First Entry ID: ${infoObj['first-entry'] ? infoObj['first-entry'][0] : 'N/A'}`)
    console.log(`  Last Entry ID: ${infoObj['last-entry'] ? infoObj['last-entry'][0] : 'N/A'}`)
    console.log(`  Consumer Groups: ${infoObj.groups || 0}\n`)

    // 消费者组信息
    if (infoObj.groups > 0) {
      console.log('Consumer Groups:')
      const groups = await redis.xinfo('GROUPS', STREAM_KEY)

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i]
        const groupObj = {}
        for (let j = 0; j < group.length; j += 2) {
          groupObj[group[j]] = group[j + 1]
        }

        console.log(`\n  Group: ${groupObj.name}`)
        console.log(`    Consumers: ${groupObj.consumers}`)
        console.log(`    Pending: ${groupObj.pending}`)
        console.log(`    Last Delivered ID: ${groupObj['last-delivered-id']}`)

        // 消费者详情
        if (groupObj.consumers > 0) {
          const consumers = await redis.xinfo('CONSUMERS', STREAM_KEY, groupObj.name)
          console.log('    Consumer Details:')

          for (let k = 0; k < consumers.length; k++) {
            const consumer = consumers[k]
            const consumerObj = {}
            for (let l = 0; l < consumer.length; l += 2) {
              consumerObj[consumer[l]] = consumer[l + 1]
            }

            console.log(`      - ${consumerObj.name}`)
            console.log(`        Pending: ${consumerObj.pending}`)
            console.log(`        Idle: ${Math.round(consumerObj.idle / 1000)}s`)
          }
        }
      }
    }

    // 最新 5 条消息
    console.log('\n📬 Latest 5 Messages:')
    const latest = await redis.xrevrange(STREAM_KEY, '+', '-', 'COUNT', 5)

    if (latest.length === 0) {
      console.log('  No messages')
    } else {
      for (const [messageId, fields] of latest) {
        const data = {}
        for (let i = 0; i < fields.length; i += 2) {
          data[fields[i]] = fields[i + 1]
        }

        try {
          const event = JSON.parse(data.data)
          console.log(`\n  ${messageId}`)
          console.log(`    Event ID: ${event.eventId}`)
          console.log(`    Model: ${event.usage.model}`)
          console.log(`    Cost: $${event.cost.total.toFixed(6)}`)
          console.log(`    Time: ${event.timestamp}`)
        } catch (e) {
          console.log(`\n  ${messageId} (Parse Error)`)
        }
      }
    }
  } catch (error) {
    console.error('❌ Failed to get queue info:', error.message)
    process.exit(1)
  }
}

/**
 * 清空队列（危险操作）
 */
async function clearQueue() {
  console.log('⚠️  WARNING: This will delete all messages in the queue!')
  console.log(`   Stream: ${STREAM_KEY}`)

  // 简单的确认机制
  const readline = require('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  rl.question('Type "yes" to confirm: ', async (answer) => {
    if (answer.toLowerCase() === 'yes') {
      try {
        await redis.del(STREAM_KEY)
        console.log('✅ Queue cleared successfully')
      } catch (error) {
        console.error('❌ Failed to clear queue:', error.message)
      }
    } else {
      console.log('❌ Operation cancelled')
    }
    rl.close()
    redis.quit()
  })
}

// ========================================
// CLI 处理
// ========================================

async function main() {
  const command = process.argv[2] || 'info'

  console.log('🔧 Billing Events Test Tool\n')

  try {
    switch (command) {
      case 'publish':
        await publishTestEvent()
        break

      case 'consume':
        await consumeTestEvents()
        break

      case 'info':
        await showQueueInfo()
        break

      case 'clear':
        await clearQueue()
        return // clearQueue 会自己关闭连接

      default:
        console.error(`❌ Unknown command: ${command}`)
        console.log('\nAvailable commands:')
        console.log('  publish  - Publish a test event')
        console.log('  consume  - Consume events (test mode)')
        console.log('  info     - Show queue status')
        console.log('  clear    - Clear the queue (dangerous)')
        process.exit(1)
    }

    await redis.quit()
  } catch (error) {
    console.error('💥 Fatal error:', error)
    await redis.quit()
    process.exit(1)
  }
}

main()

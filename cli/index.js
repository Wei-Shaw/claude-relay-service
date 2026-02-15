#!/usr/bin/env node

const { Command } = require('commander')
const inquirer = require('inquirer')
const chalk = require('chalk')
const ora = require('ora')
const { table } = require('table')
const bcrypt = require('bcryptjs')
const fs = require('fs')
const path = require('path')

const redis = require('../src/models/redis')
const apiKeyService = require('../src/services/apiKeyService')
const claudeAccountService = require('../src/services/account/claudeAccountService')
const bedrockAccountService = require('../src/services/account/bedrockAccountService')

const program = new Command()

// 🎨 样式
const styles = {
  title: chalk.bold.blue,
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.cyan,
  dim: chalk.dim
}

// 🔧 初始化
async function initialize() {
  const spinner = ora('正在连接 Redis...').start()
  try {
    await redis.connect()
    spinner.succeed('Redis 连接成功')
  } catch (error) {
    spinner.fail('Redis 连接失败')
    console.error(styles.error(error.message))
    process.exit(1)
  }
}

// 🔐 管理员账户管理
program
  .command('admin')
  .description('管理员账户操作')
  .action(async () => {
    await initialize()

    // 直接执行创建初始管理员
    await createInitialAdmin()

    await redis.disconnect()
  })

// 🔑 API Key 管理
program
  .command('keys')
  .description('API Key 管理操作')
  .action(async () => {
    await initialize()

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '请选择操作:',
        choices: [
          { name: '📋 查看所有 API Keys', value: 'list' },
          { name: '🔧 修改 API Key 过期时间', value: 'update-expiry' },
          { name: '🔄 续期即将过期的 API Key', value: 'renew' },
          { name: '🗑️  删除 API Key', value: 'delete' }
        ]
      }
    ])

    switch (action) {
      case 'list':
        await listApiKeys()
        break
      case 'update-expiry':
        await updateApiKeyExpiry()
        break
      case 'renew':
        await renewApiKeys()
        break
      case 'delete':
        await deleteApiKey()
        break
    }

    await redis.disconnect()
  })

// 📊 系统状态
program
  .command('status')
  .description('查看系统状态')
  .action(async () => {
    await initialize()

    const spinner = ora('正在获取系统状态...').start()

    try {
      const [, apiKeys, accounts] = await Promise.all([
        redis.getSystemStats(),
        apiKeyService.getAllApiKeysFast(),
        claudeAccountService.getAllAccounts()
      ])

      spinner.succeed('系统状态获取成功')

      console.log(styles.title('\n📊 系统状态概览\n'))

      const statusData = [
        ['项目', '数量', '状态'],
        ['API Keys', apiKeys.length, `${apiKeys.filter((k) => k.isActive).length} 活跃`],
        ['Claude 账户', accounts.length, `${accounts.filter((a) => a.isActive).length} 活跃`],
        ['Redis 连接', redis.isConnected ? '已连接' : '未连接', redis.isConnected ? '🟢' : '🔴'],
        ['运行时间', `${Math.floor(process.uptime() / 60)} 分钟`, '🕐']
      ]

      console.log(table(statusData))

      // 使用统计
      const totalTokens = apiKeys.reduce((sum, key) => sum + (key.usage?.total?.tokens || 0), 0)
      const totalRequests = apiKeys.reduce((sum, key) => sum + (key.usage?.total?.requests || 0), 0)

      console.log(styles.title('\n📈 使用统计\n'))
      console.log(`总 Token 使用量: ${styles.success(totalTokens.toLocaleString())}`)
      console.log(`总请求数: ${styles.success(totalRequests.toLocaleString())}`)
    } catch (error) {
      spinner.fail('获取系统状态失败')
      console.error(styles.error(error.message))
    }

    await redis.disconnect()
  })

// ☁️ Bedrock 账户管理
program
  .command('bedrock')
  .description('Bedrock 账户管理操作')
  .action(async () => {
    await initialize()

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '请选择操作:',
        choices: [
          { name: '📋 查看所有 Bedrock 账户', value: 'list' },
          { name: '➕ 创建 Bedrock 账户', value: 'create' },
          { name: '✏️  编辑 Bedrock 账户', value: 'edit' },
          { name: '🔄 切换账户状态', value: 'toggle' },
          { name: '🧪 测试账户连接', value: 'test' },
          { name: '🗑️  删除账户', value: 'delete' }
        ]
      }
    ])

    switch (action) {
      case 'list':
        await listBedrockAccounts()
        break
      case 'create':
        await createBedrockAccount()
        break
      case 'edit':
        await editBedrockAccount()
        break
      case 'toggle':
        await toggleBedrockAccount()
        break
      case 'test':
        await testBedrockAccount()
        break
      case 'delete':
        await deleteBedrockAccount()
        break
    }

    await redis.disconnect()
  })

// 实现具体功能函数

async function createInitialAdmin() {
  console.log(styles.title('\n🔐 创建初始管理员账户\n'))

  // 检查是否已存在 init.json
  const initFilePath = path.join(__dirname, '..', 'data', 'init.json')
  if (fs.existsSync(initFilePath)) {
    const existingData = JSON.parse(fs.readFileSync(initFilePath, 'utf8'))
    console.log(styles.warning('⚠️  检测到已存在管理员账户！'))
    console.log(`   用户名: ${existingData.adminUsername}`)
    console.log(`   创建时间: ${new Date(existingData.initializedAt).toLocaleString()}`)

    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: '是否覆盖现有管理员账户？',
        default: false
      }
    ])

    if (!overwrite) {
      console.log(styles.info('ℹ️  已取消创建'))
      return
    }
  }

  const adminData = await inquirer.prompt([
    {
      type: 'input',
      name: 'username',
      message: '用户名:',
      default: 'admin',
      validate: (input) => input.length >= 3 || '用户名至少3个字符'
    },
    {
      type: 'password',
      name: 'password',
      message: '密码:',
      validate: (input) => input.length >= 8 || '密码至少8个字符'
    },
    {
      type: 'password',
      name: 'confirmPassword',
      message: '确认密码:',
      validate: (input, answers) => input === answers.password || '密码不匹配'
    }
  ])

  const spinner = ora('正在创建管理员账户...').start()

  try {
    // 1. 先更新 init.json（唯一真实数据源）
    const initData = {
      initializedAt: new Date().toISOString(),
      adminUsername: adminData.username,
      adminPassword: adminData.password, // 保存明文密码
      version: '1.0.0',
      updatedAt: new Date().toISOString()
    }

    // 确保 data 目录存在
    const dataDir = path.join(__dirname, '..', 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    // 写入文件
    fs.writeFileSync(initFilePath, JSON.stringify(initData, null, 2))

    // 2. 再更新 Redis 缓存
    const passwordHash = await bcrypt.hash(adminData.password, 12)

    const credentials = {
      username: adminData.username,
      passwordHash,
      createdAt: new Date().toISOString(),
      lastLogin: null,
      updatedAt: new Date().toISOString()
    }

    await redis.setSession('admin_credentials', credentials, 0) // 永不过期

    spinner.succeed('管理员账户创建成功')
    console.log(`${styles.success('✅')} 用户名: ${adminData.username}`)
    console.log(`${styles.success('✅')} 密码: ${adminData.password}`)
    console.log(`${styles.info('ℹ️')} 请妥善保管登录凭据`)
    console.log(`${styles.info('ℹ️')} 凭据已保存到: ${initFilePath}`)
    console.log(`${styles.warning('⚠️')} 如果服务正在运行，请重启服务以加载新凭据`)
  } catch (error) {
    spinner.fail('创建管理员账户失败')
    console.error(styles.error(error.message))
  }
}

// API Key 管理功能
async function listApiKeys() {
  const spinner = ora('正在获取 API Keys...').start()

  try {
    const apiKeys = await apiKeyService.getAllApiKeysFast()
    spinner.succeed(`找到 ${apiKeys.length} 个 API Keys`)

    if (apiKeys.length === 0) {
      console.log(styles.warning('没有找到任何 API Keys'))
      return
    }

    const tableData = [['名称', 'API Key', '状态', '过期时间', '使用量', 'Token限制']]

    apiKeys.forEach((key) => {
      const now = new Date()
      const expiresAt = key.expiresAt ? new Date(key.expiresAt) : null
      let expiryStatus = '永不过期'

      if (expiresAt) {
        if (expiresAt < now) {
          expiryStatus = styles.error(`已过期 (${expiresAt.toLocaleDateString()})`)
        } else {
          const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24))
          if (daysLeft <= 7) {
            expiryStatus = styles.warning(`${daysLeft}天后过期 (${expiresAt.toLocaleDateString()})`)
          } else {
            expiryStatus = styles.success(`${expiresAt.toLocaleDateString()}`)
          }
        }
      }

      tableData.push([
        key.name,
        key.maskedKey || '-',
        key.isActive ? '🟢 活跃' : '🔴 停用',
        expiryStatus,
        `${(key.usage?.total?.tokens || 0).toLocaleString()}`,
        key.tokenLimit ? key.tokenLimit.toLocaleString() : '无限制'
      ])
    })

    console.log(styles.title('\n🔑 API Keys 列表:\n'))
    console.log(table(tableData))
  } catch (error) {
    spinner.fail('获取 API Keys 失败')
    console.error(styles.error(error.message))
  }
}

async function updateApiKeyExpiry() {
  try {
    // 获取所有 API Keys
    const apiKeys = await apiKeyService.getAllApiKeysFast()

    if (apiKeys.length === 0) {
      console.log(styles.warning('没有找到任何 API Keys'))
      return
    }

    // 选择要修改的 API Key
    const { selectedKey } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedKey',
        message: '选择要修改的 API Key:',
        choices: apiKeys.map((key) => ({
          name: `${key.name} (${key.maskedKey || key.id.substring(0, 8)}) - ${key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : '永不过期'}`,
          value: key
        }))
      }
    ])

    console.log(`\n当前 API Key: ${selectedKey.name}`)
    console.log(
      `当前过期时间: ${selectedKey.expiresAt ? new Date(selectedKey.expiresAt).toLocaleString() : '永不过期'}`
    )

    // 选择新的过期时间
    const { expiryOption } = await inquirer.prompt([
      {
        type: 'list',
        name: 'expiryOption',
        message: '选择新的过期时间:',
        choices: [
          { name: '⏰ 1分后（测试用）', value: '1m' },
          { name: '⏰ 1小时后（测试用）', value: '1h' },
          { name: '📅 1天后', value: '1d' },
          { name: '📅 7天后', value: '7d' },
          { name: '📅 30天后', value: '30d' },
          { name: '📅 90天后', value: '90d' },
          { name: '📅 365天后', value: '365d' },
          { name: '♾️  永不过期', value: 'never' },
          { name: '🎯 自定义日期时间', value: 'custom' }
        ]
      }
    ])

    let newExpiresAt = null

    if (expiryOption === 'never') {
      newExpiresAt = null
    } else if (expiryOption === 'custom') {
      const { customDate, customTime } = await inquirer.prompt([
        {
          type: 'input',
          name: 'customDate',
          message: '输入日期 (YYYY-MM-DD):',
          default: new Date().toISOString().split('T')[0],
          validate: (input) => {
            const date = new Date(input)
            return !isNaN(date.getTime()) || '请输入有效的日期格式'
          }
        },
        {
          type: 'input',
          name: 'customTime',
          message: '输入时间 (HH:MM):',
          default: '00:00',
          validate: (input) => /^\d{2}:\d{2}$/.test(input) || '请输入有效的时间格式 (HH:MM)'
        }
      ])

      newExpiresAt = new Date(`${customDate}T${customTime}:00`).toISOString()
    } else {
      // 计算新的过期时间
      const now = new Date()
      const durations = {
        '1m': 60 * 1000,
        '1h': 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
        '90d': 90 * 24 * 60 * 60 * 1000,
        '365d': 365 * 24 * 60 * 60 * 1000
      }

      newExpiresAt = new Date(now.getTime() + durations[expiryOption]).toISOString()
    }

    // 确认修改
    const confirmMsg = newExpiresAt
      ? `确认将过期时间修改为: ${new Date(newExpiresAt).toLocaleString()}?`
      : '确认设置为永不过期?'

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: confirmMsg,
        default: true
      }
    ])

    if (!confirmed) {
      console.log(styles.info('已取消修改'))
      return
    }

    // 执行修改
    const spinner = ora('正在修改过期时间...').start()

    try {
      await apiKeyService.updateApiKey(selectedKey.id, { expiresAt: newExpiresAt })
      spinner.succeed('过期时间修改成功')

      console.log(styles.success(`\n✅ API Key "${selectedKey.name}" 的过期时间已更新`))
      console.log(
        `新的过期时间: ${newExpiresAt ? new Date(newExpiresAt).toLocaleString() : '永不过期'}`
      )
    } catch (error) {
      spinner.fail('修改失败')
      console.error(styles.error(error.message))
    }
  } catch (error) {
    console.error(styles.error('操作失败:', error.message))
  }
}

async function renewApiKeys() {
  const spinner = ora('正在查找即将过期的 API Keys...').start()

  try {
    const apiKeys = await apiKeyService.getAllApiKeysFast()
    const now = new Date()
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    // 筛选即将过期的 Keys（7天内）
    const expiringKeys = apiKeys.filter((key) => {
      if (!key.expiresAt) {
        return false
      }
      const expiresAt = new Date(key.expiresAt)
      return expiresAt > now && expiresAt <= sevenDaysLater
    })

    spinner.stop()

    if (expiringKeys.length === 0) {
      console.log(styles.info('没有即将过期的 API Keys（7天内）'))
      return
    }

    console.log(styles.warning(`\n找到 ${expiringKeys.length} 个即将过期的 API Keys:\n`))

    expiringKeys.forEach((key, index) => {
      const daysLeft = Math.ceil((new Date(key.expiresAt) - now) / (1000 * 60 * 60 * 24))
      console.log(
        `${index + 1}. ${key.name} - ${daysLeft}天后过期 (${new Date(key.expiresAt).toLocaleDateString()})`
      )
    })

    const { renewOption } = await inquirer.prompt([
      {
        type: 'list',
        name: 'renewOption',
        message: '选择续期方式:',
        choices: [
          { name: '📅 全部续期30天', value: 'all30' },
          { name: '📅 全部续期90天', value: 'all90' },
          { name: '🎯 逐个选择续期', value: 'individual' }
        ]
      }
    ])

    if (renewOption.startsWith('all')) {
      const days = renewOption === 'all30' ? 30 : 90
      const renewSpinner = ora(`正在为所有 API Keys 续期 ${days} 天...`).start()

      for (const key of expiringKeys) {
        try {
          const newExpiresAt = new Date(
            new Date(key.expiresAt).getTime() + days * 24 * 60 * 60 * 1000
          ).toISOString()
          await apiKeyService.updateApiKey(key.id, { expiresAt: newExpiresAt })
        } catch (error) {
          renewSpinner.fail(`续期 ${key.name} 失败: ${error.message}`)
        }
      }

      renewSpinner.succeed(`成功续期 ${expiringKeys.length} 个 API Keys`)
    } else {
      // 逐个选择续期
      for (const key of expiringKeys) {
        console.log(`\n处理: ${key.name}`)

        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: '选择操作:',
            choices: [
              { name: '续期30天', value: '30' },
              { name: '续期90天', value: '90' },
              { name: '跳过', value: 'skip' }
            ]
          }
        ])

        if (action !== 'skip') {
          const days = parseInt(action)
          const newExpiresAt = new Date(
            new Date(key.expiresAt).getTime() + days * 24 * 60 * 60 * 1000
          ).toISOString()

          try {
            await apiKeyService.updateApiKey(key.id, { expiresAt: newExpiresAt })
            console.log(styles.success(`✅ 已续期 ${days} 天`))
          } catch (error) {
            console.log(styles.error(`❌ 续期失败: ${error.message}`))
          }
        }
      }
    }
  } catch (error) {
    spinner.fail('操作失败')
    console.error(styles.error(error.message))
  }
}

async function deleteApiKey() {
  try {
    const apiKeys = await apiKeyService.getAllApiKeysFast()

    if (apiKeys.length === 0) {
      console.log(styles.warning('没有找到任何 API Keys'))
      return
    }

    const { selectedKeys } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedKeys',
        message: '选择要删除的 API Keys (空格选择，回车确认):',
        choices: apiKeys.map((key) => ({
          name: `${key.name} (${key.maskedKey || key.id.substring(0, 8)})`,
          value: key.id
        }))
      }
    ])

    if (selectedKeys.length === 0) {
      console.log(styles.info('未选择任何 API Key'))
      return
    }

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: styles.warning(`确认删除 ${selectedKeys.length} 个 API Keys?`),
        default: false
      }
    ])

    if (!confirmed) {
      console.log(styles.info('已取消删除'))
      return
    }

    const spinner = ora('正在删除 API Keys...').start()
    let successCount = 0

    for (const keyId of selectedKeys) {
      try {
        await apiKeyService.deleteApiKey(keyId)
        successCount++
      } catch (error) {
        spinner.fail(`删除失败: ${error.message}`)
      }
    }

    spinner.succeed(`成功删除 ${successCount}/${selectedKeys.length} 个 API Keys`)
  } catch (error) {
    console.error(styles.error('删除失败:', error.message))
  }
}

// async function listClaudeAccounts() {
//   const spinner = ora('正在获取 Claude 账户...').start();

//   try {
//     const accounts = await claudeAccountService.getAllAccounts();
//     spinner.succeed(`找到 ${accounts.length} 个 Claude 账户`);

//     if (accounts.length === 0) {
//       console.log(styles.warning('没有找到任何 Claude 账户'));
//       return;
//     }

//     const tableData = [
//       ['ID', '名称', '邮箱', '状态', '代理', '最后使用']
//     ];

//     accounts.forEach(account => {
//       tableData.push([
//         account.id.substring(0, 8) + '...',
//         account.name,
//         account.email || '-',
//         account.isActive ? (account.status === 'active' ? '🟢 活跃' : '🟡 待激活') : '🔴 停用',
//         account.proxy ? '🌐 是' : '-',
//         account.lastUsedAt ? new Date(account.lastUsedAt).toLocaleDateString() : '-'
//       ]);
//     });

//     console.log('\n🏢 Claude 账户列表:\n');
//     console.log(table(tableData));

//   } catch (error) {
//     spinner.fail('获取 Claude 账户失败');
//     console.error(styles.error(error.message));
//   }
// }

// ☁️ Bedrock 账户管理函数

async function listBedrockAccounts() {
  const spinner = ora('正在获取 Bedrock 账户...').start()

  try {
    const result = await bedrockAccountService.getAllAccounts()
    if (!result.success) {
      throw new Error(result.error)
    }

    const accounts = result.data
    spinner.succeed(`找到 ${accounts.length} 个 Bedrock 账户`)

    if (accounts.length === 0) {
      console.log(styles.warning('没有找到任何 Bedrock 账户'))
      return
    }

    const tableData = [['ID', '名称', '区域', '模型', '状态', '凭证类型', '创建时间']]

    accounts.forEach((account) => {
      tableData.push([
        `${account.id.substring(0, 8)}...`,
        account.name,
        account.region,
        account.defaultModel?.split('.').pop() || 'default',
        account.isActive ? (account.schedulable ? '🟢 活跃' : '🟡 不可调度') : '🔴 停用',
        account.credentialType,
        account.createdAt ? new Date(account.createdAt).toLocaleDateString() : '-'
      ])
    })

    console.log('\n☁️ Bedrock 账户列表:\n')
    console.log(table(tableData))
  } catch (error) {
    spinner.fail('获取 Bedrock 账户失败')
    console.error(styles.error(error.message))
  }
}

async function createBedrockAccount() {
  console.log(styles.title('\n➕ 创建 Bedrock 账户\n'))

  const questions = [
    {
      type: 'input',
      name: 'name',
      message: '账户名称:',
      validate: (input) => input.trim() !== ''
    },
    {
      type: 'input',
      name: 'description',
      message: '描述 (可选):'
    },
    {
      type: 'list',
      name: 'region',
      message: '选择 AWS 区域:',
      choices: [
        { name: 'us-east-1 (北弗吉尼亚)', value: 'us-east-1' },
        { name: 'us-west-2 (俄勒冈)', value: 'us-west-2' },
        { name: 'eu-west-1 (爱尔兰)', value: 'eu-west-1' },
        { name: 'ap-southeast-1 (新加坡)', value: 'ap-southeast-1' }
      ]
    },
    {
      type: 'list',
      name: 'credentialType',
      message: '凭证类型:',
      choices: [
        { name: '默认凭证链 (环境变量/AWS配置)', value: 'default' },
        { name: '访问密钥 (Access Key)', value: 'access_key' },
        { name: 'Bearer Token (API Key)', value: 'bearer_token' }
      ]
    }
  ]

  // 根据凭证类型添加额外问题
  const answers = await inquirer.prompt(questions)

  if (answers.credentialType === 'access_key') {
    const credQuestions = await inquirer.prompt([
      {
        type: 'input',
        name: 'accessKeyId',
        message: 'AWS Access Key ID:',
        validate: (input) => input.trim() !== ''
      },
      {
        type: 'password',
        name: 'secretAccessKey',
        message: 'AWS Secret Access Key:',
        validate: (input) => input.trim() !== ''
      },
      {
        type: 'input',
        name: 'sessionToken',
        message: 'Session Token (可选，用于临时凭证):'
      }
    ])

    answers.awsCredentials = {
      accessKeyId: credQuestions.accessKeyId,
      secretAccessKey: credQuestions.secretAccessKey
    }

    if (credQuestions.sessionToken) {
      answers.awsCredentials.sessionToken = credQuestions.sessionToken
    }
  }

  const spinner = ora('正在创建 Bedrock 账户...').start()

  try {
    const result = await bedrockAccountService.createAccount(answers)

    if (!result.success) {
      throw new Error(result.error)
    }

    spinner.succeed('Bedrock 账户创建成功')
    console.log(styles.success(`账户 ID: ${result.data.id}`))
    console.log(styles.info(`名称: ${result.data.name}`))
    console.log(styles.info(`区域: ${result.data.region}`))
  } catch (error) {
    spinner.fail('创建 Bedrock 账户失败')
    console.error(styles.error(error.message))
  }
}

async function testBedrockAccount() {
  const spinner = ora('正在获取 Bedrock 账户...').start()

  try {
    const result = await bedrockAccountService.getAllAccounts()
    if (!result.success || result.data.length === 0) {
      spinner.fail('没有可测试的 Bedrock 账户')
      return
    }

    spinner.succeed('账户列表获取成功')

    const choices = result.data.map((account) => ({
      name: `${account.name} (${account.region})`,
      value: account.id
    }))

    const { accountId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'accountId',
        message: '选择要测试的账户:',
        choices
      }
    ])

    const testSpinner = ora('正在测试账户连接...').start()

    const testResult = await bedrockAccountService.testAccount(accountId)

    if (testResult.success) {
      testSpinner.succeed('账户连接测试成功')
      console.log(styles.success(`状态: ${testResult.data.status}`))
      console.log(styles.info(`区域: ${testResult.data.region}`))
      console.log(styles.info(`可用模型数量: ${testResult.data.modelsCount || 'N/A'}`))
    } else {
      testSpinner.fail('账户连接测试失败')
      console.error(styles.error(testResult.error))
    }
  } catch (error) {
    spinner.fail('测试过程中发生错误')
    console.error(styles.error(error.message))
  }
}

async function toggleBedrockAccount() {
  const spinner = ora('正在获取 Bedrock 账户...').start()

  try {
    const result = await bedrockAccountService.getAllAccounts()
    if (!result.success || result.data.length === 0) {
      spinner.fail('没有可操作的 Bedrock 账户')
      return
    }

    spinner.succeed('账户列表获取成功')

    const choices = result.data.map((account) => ({
      name: `${account.name} (${account.isActive ? '🟢 活跃' : '🔴 停用'})`,
      value: account.id
    }))

    const { accountId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'accountId',
        message: '选择要切换状态的账户:',
        choices
      }
    ])

    const toggleSpinner = ora('正在切换账户状态...').start()

    // 获取当前状态
    const accountResult = await bedrockAccountService.getAccount(accountId)
    if (!accountResult.success) {
      throw new Error('无法获取账户信息')
    }

    const newStatus = !accountResult.data.isActive
    const updateResult = await bedrockAccountService.updateAccount(accountId, {
      isActive: newStatus
    })

    if (updateResult.success) {
      toggleSpinner.succeed('账户状态切换成功')
      console.log(styles.success(`新状态: ${newStatus ? '🟢 活跃' : '🔴 停用'}`))
    } else {
      throw new Error(updateResult.error)
    }
  } catch (error) {
    spinner.fail('切换账户状态失败')
    console.error(styles.error(error.message))
  }
}

async function editBedrockAccount() {
  const spinner = ora('正在获取 Bedrock 账户...').start()

  try {
    const result = await bedrockAccountService.getAllAccounts()
    if (!result.success || result.data.length === 0) {
      spinner.fail('没有可编辑的 Bedrock 账户')
      return
    }

    spinner.succeed('账户列表获取成功')

    const choices = result.data.map((account) => ({
      name: `${account.name} (${account.region})`,
      value: account.id
    }))

    const { accountId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'accountId',
        message: '选择要编辑的账户:',
        choices
      }
    ])

    const accountResult = await bedrockAccountService.getAccount(accountId)
    if (!accountResult.success) {
      throw new Error('无法获取账户信息')
    }

    const account = accountResult.data

    const updates = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: '账户名称:',
        default: account.name
      },
      {
        type: 'input',
        name: 'description',
        message: '描述:',
        default: account.description
      },
      {
        type: 'number',
        name: 'priority',
        message: '优先级 (1-100):',
        default: account.priority,
        validate: (input) => input >= 1 && input <= 100
      }
    ])

    const updateSpinner = ora('正在更新账户...').start()

    const updateResult = await bedrockAccountService.updateAccount(accountId, updates)

    if (updateResult.success) {
      updateSpinner.succeed('账户更新成功')
    } else {
      throw new Error(updateResult.error)
    }
  } catch (error) {
    spinner.fail('编辑账户失败')
    console.error(styles.error(error.message))
  }
}

async function deleteBedrockAccount() {
  const spinner = ora('正在获取 Bedrock 账户...').start()

  try {
    const result = await bedrockAccountService.getAllAccounts()
    if (!result.success || result.data.length === 0) {
      spinner.fail('没有可删除的 Bedrock 账户')
      return
    }

    spinner.succeed('账户列表获取成功')

    const choices = result.data.map((account) => ({
      name: `${account.name} (${account.region})`,
      value: { id: account.id, name: account.name }
    }))

    const { account } = await inquirer.prompt([
      {
        type: 'list',
        name: 'account',
        message: '选择要删除的账户:',
        choices
      }
    ])

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `确定要删除账户 "${account.name}" 吗？此操作无法撤销！`,
        default: false
      }
    ])

    if (!confirm) {
      console.log(styles.info('已取消删除'))
      return
    }

    const deleteSpinner = ora('正在删除账户...').start()

    const deleteResult = await bedrockAccountService.deleteAccount(account.id)

    if (deleteResult.success) {
      deleteSpinner.succeed('账户删除成功')
    } else {
      throw new Error(deleteResult.error)
    }
  } catch (error) {
    spinner.fail('删除账户失败')
    console.error(styles.error(error.message))
  }
}

// 程序信息
program.name('claude-relay-cli').description('Claude Relay Service 命令行管理工具').version('1.0.0')

// 解析命令行参数
program.parse()

// 如果没有提供命令，显示帮助
if (!process.argv.slice(2).length) {
  console.log(styles.title('🚀 Claude Relay Service CLI\n'))
  console.log('使用以下命令管理服务:\n')
  console.log('  claude-relay-cli admin         - 创建初始管理员账户')
  console.log('  claude-relay-cli keys          - API Key 管理（查看/修改过期时间/续期/删除）')
  console.log('  claude-relay-cli bedrock       - Bedrock 账户管理（创建/查看/编辑/测试/删除）')
  console.log('  claude-relay-cli status        - 查看系统状态')
  console.log('\n使用 --help 查看详细帮助信息')
}

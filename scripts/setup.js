const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const chalk = require('chalk')
const ora = require('ora')

const config = require('../config/config')
const { createAdminInitData } = require('../src/utils/adminCredentials')

async function setup() {
  console.log(chalk.blue.bold('\n🚀 Claude Relay Service 初始化设置\n'))

  const spinner = ora('正在进行初始化设置...').start()

  try {
    // 1. 创建必要目录
    const directories = ['logs', 'data', 'temp']

    directories.forEach((dir) => {
      const dirPath = path.join(__dirname, '..', dir)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }
    })

    // 2. 生成环境配置文件
    if (!fs.existsSync(path.join(__dirname, '..', '.env'))) {
      const envTemplate = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8')

      // 生成随机密钥
      const jwtSecret = crypto.randomBytes(64).toString('hex')
      const encryptionKey = crypto.randomBytes(32).toString('hex')

      const envContent = envTemplate
        .replace('your-jwt-secret-here', jwtSecret)
        .replace('your-encryption-key-here', encryptionKey)

      fs.writeFileSync(path.join(__dirname, '..', '.env'), envContent)
    }

    // 3. 生成或使用环境变量中的管理员凭据
    const adminUsername =
      process.env.ADMIN_USERNAME || `cr_admin_${crypto.randomBytes(4).toString('hex')}`
    const adminPassword =
      process.env.ADMIN_PASSWORD ||
      crypto
        .randomBytes(16)
        .toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 16)

    // 如果使用了环境变量，显示提示
    if (process.env.ADMIN_USERNAME || process.env.ADMIN_PASSWORD) {
      console.log(chalk.yellow('\n📌 使用环境变量中的管理员凭据'))
    }

    // 4. 创建初始化完成标记文件
    const initData = await createAdminInitData({
      adminUsername,
      adminPassword,
      initializedAt: new Date().toISOString(),
      version: '1.0.0'
    })

    fs.writeFileSync(
      path.join(__dirname, '..', 'data', 'init.json'),
      JSON.stringify(initData, null, 2)
    )

    spinner.succeed('初始化设置完成')

    console.log(chalk.green('\n✅ 设置完成！\n'))
    console.log(chalk.yellow('📋 重要信息：\n'))
    console.log(`   管理员用户名: ${chalk.cyan(adminUsername)}`)
    console.log(`   管理员密码:   ${chalk.cyan(adminPassword)}`)

    // 如果是自动生成的凭据，强调需要保存
    if (!process.env.ADMIN_USERNAME && !process.env.ADMIN_PASSWORD) {
      console.log(chalk.red('\n⚠️  请立即保存这些凭据！首次登录后建议修改密码。'))
      console.log(
        chalk.yellow(
          '\n💡 提示: 也可以通过环境变量 ADMIN_USERNAME 和 ADMIN_PASSWORD 预设管理员凭据。\n'
        )
      )
    } else {
      console.log(chalk.green('\n✅ 已使用预设的管理员凭据。\n'))
    }

    console.log(chalk.blue('🚀 启动服务：\n'))
    console.log('   npm start              - 启动生产服务')
    console.log('   npm run dev            - 启动开发服务')
    console.log('   npm run cli admin      - 管理员CLI工具\n')

    console.log(chalk.blue('🌐 访问地址：\n'))
    console.log(`   Web管理界面: http://localhost:${config.server.port}/web`)
    console.log(`   API端点:     http://localhost:${config.server.port}/api/v1/messages`)
    console.log(`   健康检查:    http://localhost:${config.server.port}/health\n`)
  } catch (error) {
    spinner.fail('初始化设置失败')
    console.error(chalk.red('❌ 错误:'), error.message)
    process.exit(1)
  }
}

// 检查是否已初始化
function checkInitialized() {
  const initFile = path.join(__dirname, '..', 'data', 'init.json')
  if (fs.existsSync(initFile)) {
    const initData = JSON.parse(fs.readFileSync(initFile, 'utf8'))
    console.log(chalk.yellow('⚠️  服务已经初始化过了！'))
    console.log(`   初始化时间: ${new Date(initData.initializedAt).toLocaleString()}`)
    console.log(`   管理员用户名: ${initData.adminUsername}`)
    console.log('\n如需重新初始化，请删除 data/init.json 文件后再运行此命令。')
    console.log(chalk.red('\n⚠️  重要提示：'))
    console.log('   1. 删除 init.json 文件后运行 npm run setup')
    console.log('   2. 生成新的账号密码后，需要重启服务才能生效')
    console.log('   3. 使用 npm run service:restart 重启服务\n')
    return true
  }
  return false
}

if (require.main === module) {
  if (!checkInitialized()) {
    setup()
  }
}

module.exports = { setup, checkInitialized }

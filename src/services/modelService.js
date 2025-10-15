const fs = require('fs')
const path = require('path')
const logger = require('../utils/logger')

/**
 * 模型服务
 * 管理系统支持的 AI 模型列表
 * 与 pricingService 独立，专注于"支持哪些模型"而不是"如何计费"
 */
class ModelService {
  constructor() {
    this.modelsFile = path.join(process.cwd(), 'data', 'supported_models.json')
    this.supportedModels = null
    this.fileWatcher = null
  }

  /**
   * 初始化模型服务
   */
  async initialize() {
    try {
      this.loadModels()
      this.setupFileWatcher()
      logger.success('✅ Model service initialized successfully')
    } catch (error) {
      logger.error('❌ Failed to initialize model service:', error)
    }
  }

  /**
   * 加载支持的模型配置
   */
  loadModels() {
    try {
      if (fs.existsSync(this.modelsFile)) {
        const data = fs.readFileSync(this.modelsFile, 'utf8')
        this.supportedModels = JSON.parse(data)

        const totalModels = Object.values(this.supportedModels).reduce(
          (sum, config) => sum + config.models.length,
          0
        )

        logger.info(`📋 Loaded ${totalModels} supported models from configuration`)
      } else {
        logger.warn('⚠️ Supported models file not found, using defaults')
        this.supportedModels = this.getDefaultModels()

        // 创建默认配置文件
        this.saveDefaultConfig()
      }
    } catch (error) {
      logger.error('❌ Failed to load supported models:', error)
      this.supportedModels = this.getDefaultModels()
    }
  }

  /**
   * 获取默认模型配置（后备方案）
   */
  getDefaultModels() {
    return {
      claude: {
        provider: 'anthropic',
        description: 'Claude models from Anthropic',
        models: [
          'claude-sonnet-4-5-20250929',
          'claude-opus-4-1-20250805',
          'claude-sonnet-4-20250514',
          'claude-opus-4-20250514',
          'claude-3-7-sonnet-20250219',
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229',
          'claude-3-haiku-20240307'
        ]
      },
      openai: {
        provider: 'openai',
        description: 'OpenAI GPT models',
        models: [
          'gpt-4o',
          'gpt-4o-mini',
          'gpt-4.1',
          'gpt-4.1-mini',
          'gpt-4.1-nano',
          'gpt-4-turbo',
          'gpt-4',
          'gpt-3.5-turbo',
          'o3',
          'o4-mini',
          'chatgpt-4o-latest'
        ]
      },
      gemini: {
        provider: 'google',
        description: 'Google Gemini models',
        models: [
          'gemini-1.5-pro',
          'gemini-1.5-flash',
          'gemini-2.0-flash',
          'gemini-2.0-flash-exp',
          'gemini-2.0-flash-thinking',
          'gemini-2.0-flash-thinking-exp',
          'gemini-2.0-pro',
          'gemini-2.5-flash',
          'gemini-2.5-flash-lite',
          'gemini-2.5-pro'
        ]
      }
    }
  }

  /**
   * 保存默认配置到文件
   */
  saveDefaultConfig() {
    try {
      const dataDir = path.dirname(this.modelsFile)
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
      }

      fs.writeFileSync(this.modelsFile, JSON.stringify(this.supportedModels, null, 2))
      logger.info('💾 Created default supported_models.json configuration')
    } catch (error) {
      logger.error('❌ Failed to save default config:', error)
    }
  }

  /**
   * 获取所有支持的模型（OpenAI API 格式）
   */
  getAllModels() {
    const models = []
    const now = Math.floor(Date.now() / 1000)

    for (const [_service, config] of Object.entries(this.supportedModels)) {
      for (const modelId of config.models) {
        models.push({
          id: modelId,
          object: 'model',
          created: now,
          owned_by: config.provider
        })
      }
    }

    return models.sort((a, b) => {
      // 先按 provider 排序，再按 model id 排序
      if (a.owned_by !== b.owned_by) {
        return a.owned_by.localeCompare(b.owned_by)
      }
      return a.id.localeCompare(b.id)
    })
  }

  /**
   * 按 provider 获取模型
   * @param {string} provider - 'anthropic', 'openai', 'google' 等
   */
  getModelsByProvider(provider) {
    return this.getAllModels().filter((m) => m.owned_by === provider)
  }

  /**
   * 检查模型是否被支持
   * @param {string} modelId - 模型 ID
   */
  isModelSupported(modelId) {
    if (!modelId) {
      return false
    }
    return this.getAllModels().some((m) => m.id === modelId)
  }

  /**
   * 获取模型的 provider
   * @param {string} modelId - 模型 ID
   */
  getModelProvider(modelId) {
    const model = this.getAllModels().find((m) => m.id === modelId)
    return model ? model.owned_by : null
  }

  /**
   * 重新加载模型配置
   */
  reloadModels() {
    logger.info('🔄 Reloading supported models configuration...')
    this.loadModels()
  }

  /**
   * 设置文件监听器（监听配置文件变化）
   */
  setupFileWatcher() {
    try {
      // 如果已有监听器，先关闭
      if (this.fileWatcher) {
        this.fileWatcher.close()
        this.fileWatcher = null
      }

      // 只有文件存在时才设置监听器
      if (!fs.existsSync(this.modelsFile)) {
        logger.debug('📋 Models file does not exist yet, skipping file watcher setup')
        return
      }

      // 使用 fs.watchFile 监听文件变化
      const watchOptions = {
        persistent: true,
        interval: 60000 // 每60秒检查一次
      }

      let lastMtime = fs.statSync(this.modelsFile).mtimeMs

      fs.watchFile(this.modelsFile, watchOptions, (curr, _prev) => {
        if (curr.mtimeMs !== lastMtime) {
          lastMtime = curr.mtimeMs
          logger.info('📋 Detected change in supported_models.json, reloading...')
          this.reloadModels()
        }
      })

      // 保存引用以便清理
      this.fileWatcher = {
        close: () => fs.unwatchFile(this.modelsFile)
      }

      logger.info('👁️  File watcher set up for supported_models.json')
    } catch (error) {
      logger.error('❌ Failed to setup file watcher:', error)
    }
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    const totalModels = this.supportedModels
      ? Object.values(this.supportedModels).reduce((sum, config) => sum + config.models.length, 0)
      : 0

    return {
      initialized: this.supportedModels !== null,
      totalModels,
      providers: this.supportedModels ? Object.keys(this.supportedModels) : [],
      fileExists: fs.existsSync(this.modelsFile)
    }
  }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.fileWatcher) {
      this.fileWatcher.close()
      this.fileWatcher = null
      logger.debug('📋 Model service file watcher closed')
    }
  }
}

module.exports = new ModelService()

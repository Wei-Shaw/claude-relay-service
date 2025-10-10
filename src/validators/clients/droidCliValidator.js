const logger = require('../../utils/logger')
const { CLIENT_DEFINITIONS } = require('../clientDefinitions')

/**
 * Droid CLI 验证器
 * 检查请求是否来自 Factory Droid CLI
 */
class DroidCliValidator {
  static getId() {
    return CLIENT_DEFINITIONS.DROID_CLI.id
  }

  static getName() {
    return CLIENT_DEFINITIONS.DROID_CLI.name
  }

  static getDescription() {
    return CLIENT_DEFINITIONS.DROID_CLI.description
  }

  static validate(req) {
    try {
      const userAgent = req.headers['user-agent'] || ''
      const factoryClientHeader = (req.headers['x-factory-client'] || '').toString().toLowerCase()

      const uaMatch = /factory-cli\/(\d+\.\d+\.\d+)/i.exec(userAgent)
      const hasFactoryClientHeader =
        typeof factoryClientHeader === 'string' &&
        (factoryClientHeader.includes('droid') || factoryClientHeader.includes('factory-cli'))

      if (!uaMatch && !hasFactoryClientHeader) {
        logger.debug(`Droid CLI validation failed - UA mismatch: ${userAgent}`)
        return false
      }

      // 允许，通过基础验证
      logger.debug(
        `Droid CLI validation passed (UA: ${userAgent || 'N/A'}, header: ${factoryClientHeader || 'N/A'})`
      )
      return true
    } catch (error) {
      logger.error('Error in DroidCliValidator:', error)
      return false
    }
  }

  static getInfo() {
    return {
      id: this.getId(),
      name: this.getName(),
      description: this.getDescription(),
      icon: CLIENT_DEFINITIONS.DROID_CLI.icon
    }
  }
}

module.exports = DroidCliValidator

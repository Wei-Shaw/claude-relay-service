const ldap = require('ldapjs')
const logger = require('../utils/logger')
const config = require('../../config/config')
const userService = require('./userService')

class LdapService {
  constructor() {
    this.config = config.ldap
    this.client = null
  }

  // 🔗 创建LDAP客户端连接
  createClient() {
    try {
      const client = ldap.createClient({
        url: this.config.server.url,
        timeout: this.config.server.timeout,
        connectTimeout: this.config.server.connectTimeout,
        reconnect: true
      })

      // 设置错误处理
      client.on('error', (err) => {
        logger.error('🔌 LDAP client error:', err)
      })

      client.on('connect', () => {
        logger.info('🔗 LDAP client connected successfully')
      })

      client.on('connectTimeout', () => {
        logger.warn('⏱️ LDAP connection timeout')
      })

      return client
    } catch (error) {
      logger.error('❌ Failed to create LDAP client:', error)
      throw error
    }
  }

  // 🔒 绑定LDAP连接（管理员认证）
  async bindClient(client) {
    return new Promise((resolve, reject) => {
      client.bind(this.config.server.bindDN, this.config.server.bindCredentials, (err) => {
        if (err) {
          logger.error('❌ LDAP bind failed:', err)
          reject(err)
        } else {
          logger.debug('🔑 LDAP bind successful')
          resolve()
        }
      })
    })
  }

  // 🔍 搜索用户
  async searchUser(client, username) {
    return new Promise((resolve, reject) => {
      const searchFilter = this.config.server.searchFilter.replace('{{username}}', username)
      const searchOptions = {
        scope: 'sub',
        filter: searchFilter,
        attributes: this.config.server.searchAttributes
      }

      logger.debug(`🔍 Searching for user: ${username} with filter: ${searchFilter}`)

      const entries = []
      
      client.search(this.config.server.searchBase, searchOptions, (err, res) => {
        if (err) {
          logger.error('❌ LDAP search error:', err)
          reject(err)
          return
        }

        res.on('searchEntry', (entry) => {
          entries.push(entry)
        })

        res.on('searchReference', (referral) => {
          logger.debug('🔗 LDAP search referral:', referral.uris)
        })

        res.on('error', (err) => {
          logger.error('❌ LDAP search result error:', err)
          reject(err)
        })

        res.on('end', (result) => {
          logger.debug(`✅ LDAP search completed. Status: ${result.status}, Found ${entries.length} entries`)
          
          if (entries.length === 0) {
            resolve(null)
          } else if (entries.length === 1) {
            resolve(entries[0])
          } else {
            logger.warn(`⚠️ Multiple LDAP entries found for username: ${username}`)
            resolve(entries[0]) // 使用第一个结果
          }
        })
      })
    })
  }

  // 🔐 验证用户密码
  async authenticateUser(userDN, password) {
    return new Promise((resolve, reject) => {
      const authClient = this.createClient()
      
      authClient.bind(userDN, password, (err) => {
        authClient.unbind() // 立即关闭认证客户端
        
        if (err) {
          if (err.name === 'InvalidCredentialsError') {
            logger.debug(`🚫 Invalid credentials for DN: ${userDN}`)
            resolve(false)
          } else {
            logger.error('❌ LDAP authentication error:', err)
            reject(err)
          }
        } else {
          logger.debug(`✅ Authentication successful for DN: ${userDN}`)
          resolve(true)
        }
      })
    })
  }

  // 📝 提取用户信息
  extractUserInfo(ldapEntry, username) {
    try {
      const attributes = ldapEntry.attributes || []
      const userInfo = { username }

      // 创建属性映射
      const attrMap = {}
      attributes.forEach(attr => {
        const name = attr.type || attr.name
        const values = Array.isArray(attr.values) ? attr.values : [attr.values]
        attrMap[name] = values.length === 1 ? values[0] : values
      })

      // 根据配置映射用户属性
      const mapping = this.config.userMapping
      
      userInfo.displayName = attrMap[mapping.displayName] || username
      userInfo.email = attrMap[mapping.email] || ''
      userInfo.firstName = attrMap[mapping.firstName] || ''
      userInfo.lastName = attrMap[mapping.lastName] || ''

      // 如果没有displayName，尝试组合firstName和lastName
      if (!userInfo.displayName || userInfo.displayName === username) {
        if (userInfo.firstName || userInfo.lastName) {
          userInfo.displayName = `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim()
        }
      }

      logger.debug('📋 Extracted user info:', {
        username: userInfo.username,
        displayName: userInfo.displayName,
        email: userInfo.email
      })

      return userInfo
    } catch (error) {
      logger.error('❌ Error extracting user info:', error)
      return { username }
    }
  }

  // 🔐 主要的登录验证方法
  async authenticateUserCredentials(username, password) {
    if (!this.config.enabled) {
      throw new Error('LDAP authentication is not enabled')
    }

    if (!username || !password) {
      throw new Error('Username and password are required')
    }

    const client = this.createClient()

    try {
      // 1. 使用管理员凭据绑定
      await this.bindClient(client)

      // 2. 搜索用户
      const ldapEntry = await this.searchUser(client, username)
      if (!ldapEntry) {
        logger.info(`🚫 User not found in LDAP: ${username}`)
        return { success: false, message: 'Invalid username or password' }
      }

      // 3. 获取用户DN
      const userDN = ldapEntry.dn
      logger.debug(`👤 Found user DN: ${userDN}`)

      // 4. 验证用户密码
      const isPasswordValid = await this.authenticateUser(userDN, password)
      if (!isPasswordValid) {
        logger.info(`🚫 Invalid password for user: ${username}`)
        return { success: false, message: 'Invalid username or password' }
      }

      // 5. 提取用户信息
      const userInfo = this.extractUserInfo(ldapEntry, username)

      // 6. 创建或更新本地用户
      const user = await userService.createOrUpdateUser(userInfo)

      // 7. 记录登录
      await userService.recordUserLogin(user.id)

      // 8. 创建用户会话
      const sessionToken = await userService.createUserSession(user.id)

      logger.info(`✅ LDAP authentication successful for user: ${username}`)

      return {
        success: true,
        user,
        sessionToken,
        message: 'Authentication successful'
      }

    } catch (error) {
      logger.error('❌ LDAP authentication error:', error)
      return {
        success: false,
        message: 'Authentication service unavailable'
      }
    } finally {
      // 确保客户端连接被关闭
      if (client) {
        client.unbind((err) => {
          if (err) {
            logger.debug('Error unbinding LDAP client:', err)
          }
        })
      }
    }
  }

  // 🔍 测试LDAP连接
  async testConnection() {
    if (!this.config.enabled) {
      return { success: false, message: 'LDAP is not enabled' }
    }

    const client = this.createClient()

    try {
      await this.bindClient(client)
      
      return {
        success: true,
        message: 'LDAP connection successful',
        server: this.config.server.url,
        searchBase: this.config.server.searchBase
      }
    } catch (error) {
      logger.error('❌ LDAP connection test failed:', error)
      return {
        success: false,
        message: `LDAP connection failed: ${error.message}`,
        server: this.config.server.url
      }
    } finally {
      if (client) {
        client.unbind((err) => {
          if (err) {
            logger.debug('Error unbinding test LDAP client:', err)
          }
        })
      }
    }
  }

  // 📊 获取LDAP配置信息（不包含敏感信息）
  getConfigInfo() {
    return {
      enabled: this.config.enabled,
      server: {
        url: this.config.server.url,
        searchBase: this.config.server.searchBase,
        searchFilter: this.config.server.searchFilter,
        timeout: this.config.server.timeout
      },
      userMapping: this.config.userMapping
    }
  }
}

module.exports = new LdapService()
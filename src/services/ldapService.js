const ldap = require('ldapjs')
const logger = require('../utils/logger')

class LDAPService {
  constructor() {
    this.client = null
    this.config = {
      url: process.env.LDAP_URL || 'ldap://172.25.3.100:389',
      bindDN: process.env.LDAP_BIND_DN || 'LDAP-Proxy-Read',
      bindPassword: process.env.LDAP_BIND_PASSWORD || 'Y%77JsVK8W',
      baseDN: process.env.LDAP_BASE_DN || 'OU=微店,DC=corp,DC=weidian-inc,DC=com',
      searchFilter: process.env.LDAP_SEARCH_FILTER || '(&(objectClass=user)(cn={username}))',
      timeout: parseInt(process.env.LDAP_TIMEOUT) || 10000,
      connectTimeout: parseInt(process.env.LDAP_CONNECT_TIMEOUT) || 10000
    }
  }

  /**
   * 创建LDAP连接
   */
  createConnection() {
    return new Promise((resolve, reject) => {
      const options = {
        url: this.config.url,
        timeout: this.config.timeout,
        connectTimeout: this.config.connectTimeout,
        reconnect: false,
        // 匹配Python代码中的设置：禁用referrals
        followReferrals: false,
        // LDAP协议版本3
        version: 3,
        // 增加兼容性选项
        strictDN: false
      }

      this.client = ldap.createClient(options)

      // 连接超时处理
      const timeoutTimer = setTimeout(() => {
        this.client.destroy()
        reject(new Error(`LDAP connection timeout after ${this.config.connectTimeout}ms`))
      }, this.config.connectTimeout)

      // 连接成功
      this.client.on('connect', () => {
        clearTimeout(timeoutTimer)
        logger.info('LDAP connection established successfully')
        resolve()
      })

      // 连接错误
      this.client.on('error', (err) => {
        clearTimeout(timeoutTimer)
        logger.error('LDAP connection error:', err)
        reject(err)
      })

      // 连接关闭
      this.client.on('close', () => {
        logger.info('LDAP connection closed')
      })
    })
  }

  /**
   * 绑定LDAP连接（认证）
   */
  bind() {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        return reject(new Error('LDAP client not initialized'))
      }

      this.client.bind(this.config.bindDN, this.config.bindPassword, (err) => {
        if (err) {
          logger.error('LDAP bind failed:', err)
          reject(err)
        } else {
          logger.info('LDAP bind successful')
          resolve()
        }
      })
    })
  }

  /**
   * 测试AD域控连接
   */
  async testConnection() {
    try {
      logger.info('Testing LDAP/AD connection...')
      logger.info(`Connecting to: ${this.config.url}`)
      logger.info(`Bind DN: ${this.config.bindDN}`)
      logger.info(`Base DN: ${this.config.baseDN}`)

      await this.createConnection()
      await this.bind()

      // 先测试连接和绑定是否真的成功
      logger.info('LDAP connection and bind successful')

      // 尝试简单的根 DSE 查询来验证连接
      let searchResult = null
      try {
        searchResult = await this.testRootDSE()
        logger.info('Root DSE query successful')
      } catch (searchError) {
        logger.warn('Root DSE query failed, trying base search:', searchError.message)
        try {
          searchResult = await this.testSearch()
        } catch (baseSearchError) {
          logger.warn('Base search also failed:', baseSearchError.message)
          // 连接成功但搜索失败，仍然返回部分成功
          return {
            success: true,
            message:
              'LDAP connection and authentication successful, but search requires DN adjustment',
            connectionTest: 'SUCCESS',
            authTest: 'SUCCESS',
            searchTest: `FAILED - ${baseSearchError.message}`,
            config: {
              url: this.config.url,
              bindDN: this.config.bindDN,
              baseDN: this.config.baseDN,
              searchFilter: this.config.searchFilter
            }
          }
        }
      }

      logger.info('LDAP/AD full connection test successful')
      return {
        success: true,
        message: 'LDAP/AD connection test successful',
        connectionTest: 'SUCCESS',
        authTest: 'SUCCESS',
        searchTest: 'SUCCESS',
        config: {
          url: this.config.url,
          bindDN: this.config.bindDN,
          baseDN: this.config.baseDN,
          searchFilter: this.config.searchFilter
        },
        searchResult
      }
    } catch (error) {
      logger.error('LDAP/AD connection test failed:', error)
      return {
        success: false,
        message: `LDAP/AD connection test failed: ${error.message}`,
        error: error.message,
        connectionTest: error.message.includes('connect') ? 'FAILED' : 'UNKNOWN',
        authTest:
          error.message.includes('bind') || error.message.includes('authentication')
            ? 'FAILED'
            : 'UNKNOWN',
        config: {
          url: this.config.url,
          bindDN: this.config.bindDN,
          baseDN: this.config.baseDN
        }
      }
    } finally {
      this.disconnect()
    }
  }

  /**
   * 测试根DSE查询（最基本的LDAP查询）
   */
  testRootDSE() {
    return new Promise((resolve, reject) => {
      const searchOptions = {
        filter: '(objectClass=*)',
        scope: 'base',
        attributes: ['*']
      }

      this.client.search('', searchOptions, (err, res) => {
        if (err) {
          reject(err)
          return
        }

        let rootDSE = null

        res.on('searchEntry', (entry) => {
          rootDSE = {
            dn: entry.dn,
            namingContexts: entry.object?.namingContexts || entry.attributes?.namingContexts,
            supportedLDAPVersion:
              entry.object?.supportedLDAPVersion || entry.attributes?.supportedLDAPVersion,
            defaultNamingContext:
              entry.object?.defaultNamingContext || entry.attributes?.defaultNamingContext,
            raw: entry.object || entry.attributes
          }
        })

        res.on('referral', (referral) => {
          logger.info(`Root DSE referral: ${referral}`)
        })

        res.on('error', (error) => {
          if (error.message && error.message.toLowerCase().includes('referral')) {
            logger.warn(`Root DSE referral error (ignored): ${error.message}`)
            return
          }
          reject(error)
        })

        res.on('end', () => {
          if (rootDSE) {
            logger.info('Root DSE query completed successfully')
            resolve(rootDSE)
          } else {
            resolve({ message: 'No Root DSE data returned' })
          }
        })
      })
    })
  }

  /**
   * 执行测试搜索
   */
  testSearch() {
    return new Promise((resolve, reject) => {
      // 匹配Python代码的搜索：查找用户对象，获取CN和userAccountControl属性
      const searchOptions = {
        filter: '(objectClass=user)',
        scope: 'sub', // SCOPE_SUBTREE in Python
        attributes: ['CN', 'userAccountControl'],
        sizeLimit: 10 // 限制结果数量
      }

      this.client.search(this.config.baseDN, searchOptions, (err, res) => {
        if (err) {
          reject(err)
          return
        }

        let entryCount = 0
        const entries = []

        res.on('searchEntry', (entry) => {
          entryCount++
          entries.push({
            dn: entry.dn,
            cn: entry.object.CN || entry.object.cn,
            userAccountControl: entry.object.userAccountControl
          })
        })

        res.on('referral', (referral) => {
          // 记录referral但不作为错误处理
          logger.info(`LDAP referral received: ${referral}`)
        })

        res.on('error', (error) => {
          // 如果是referral相关错误，不视为失败
          if (error.message && error.message.toLowerCase().includes('referral')) {
            logger.warn(`LDAP referral error (ignored): ${error.message}`)
            return
          }
          reject(error)
        })

        res.on('end', (result) => {
          logger.info(
            `Search test completed. Found ${entryCount} entries, status: ${result.status}`
          )
          resolve({
            entryCount,
            status: result.status,
            entries: entries.slice(0, 5)
          })
        })
      })
    })
  }

  /**
   * 根据用户名搜索用户
   */
  searchUser(username) {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        return reject(new Error('LDAP client not initialized'))
      }

      const filter = this.config.searchFilter.replace(/{username}/g, username)
      const searchOptions = {
        filter,
        scope: 'sub',
        attributes: [
          'dn',
          'sAMAccountName',
          'displayName',
          'mail',
          'memberOf',
          'cn',
          'userAccountControl'
        ]
      }

      logger.info(`Searching for user: ${username}, Filter: ${filter}`)

      this.client.search(this.config.baseDN, searchOptions, (err, res) => {
        if (err) {
          reject(err)
          return
        }

        const users = []

        res.on('searchEntry', (entry) => {
          const obj = entry.object || {}
          const attrs = entry.attributes || []

          // 创建属性查找函数
          const getAttr = (name) => {
            if (obj[name]) {
              return obj[name]
            }
            const attr = attrs.find((a) => a.type === name)
            return attr ? (Array.isArray(attr.values) ? attr.values[0] : attr.values) : null
          }

          const user = {
            dn: entry.dn,
            username: getAttr('sAMAccountName'),
            displayName: getAttr('displayName'),
            email: getAttr('mail'),
            cn: getAttr('cn'),
            userAccountControl: getAttr('userAccountControl'),
            groups: (() => {
              const memberOf = getAttr('memberOf')
              return Array.isArray(memberOf) ? memberOf : memberOf ? [memberOf] : []
            })()
          }
          users.push(user)
        })

        res.on('referral', (referral) => {
          logger.info(`LDAP referral received during user search: ${referral}`)
        })

        res.on('error', (error) => {
          if (error.message && error.message.toLowerCase().includes('referral')) {
            logger.warn(`LDAP referral error during user search (ignored): ${error.message}`)
            return
          }
          reject(error)
        })

        res.on('end', () => {
          logger.info(`Found ${users.length} users for username: ${username}`)
          resolve(users)
        })
      })
    })
  }

  /**
   * 列出所有用户（模拟Python代码的describe_ou功能）
   */
  listAllUsers(limit = 20, type = 'human') {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        return reject(new Error('LDAP client not initialized'))
      }

      // 根据类型选择不同的搜索过滤器
      let filter
      if (type === 'computer') {
        // 只显示计算机账户
        filter = '(&(objectClass=user)(sAMAccountName=*$))'
      } else if (type === 'human') {
        // 只显示人员账户（排除计算机账户）
        filter = '(&(objectClass=user)(!(sAMAccountName=*$)))'
      } else {
        // 显示所有用户
        filter = '(objectClass=user)'
      }

      const searchOptions = {
        filter,
        scope: 'sub', // SCOPE_SUBTREE
        attributes: ['CN', 'userAccountControl', 'sAMAccountName', 'displayName', 'mail', 'dn']
        // 不使用 sizeLimit，而是在客户端限制结果数量
      }

      logger.info(`Listing all users with filter: ${searchOptions.filter}, limit: ${limit}`)

      this.client.search(this.config.baseDN, searchOptions, (err, res) => {
        if (err) {
          reject(err)
          return
        }

        const users = []

        res.on('searchEntry', (entry) => {
          // 如果已经达到限制，停止处理
          if (users.length >= limit) {
            return
          }

          const obj = entry.object || {}
          const attrs = entry.attributes || []

          // 创建属性查找函数
          const getAttr = (name) => {
            if (obj[name]) {
              return obj[name]
            }
            const attr = attrs.find((a) => a.type === name)
            return attr ? (Array.isArray(attr.values) ? attr.values[0] : attr.values) : null
          }

          const user = {
            dn: entry.dn,
            cn: getAttr('CN') || getAttr('cn'),
            sAMAccountName: getAttr('sAMAccountName'),
            displayName: getAttr('displayName'),
            email: getAttr('mail'),
            userAccountControl: getAttr('userAccountControl'),
            // 为了兼容Python代码的数据结构
            org: entry.dn,
            // 调试信息 (限制原始数据大小)
            raw: users.length < 3 ? { object: entry.object, attributes: entry.attributes } : null
          }
          users.push(user)
        })

        res.on('referral', (referral) => {
          logger.info(`LDAP referral received during user listing: ${referral}`)
        })

        res.on('error', (error) => {
          if (error.message && error.message.toLowerCase().includes('referral')) {
            logger.warn(`LDAP referral error during user listing (ignored): ${error.message}`)
            return
          }
          reject(error)
        })

        res.on('end', () => {
          logger.info(`Found ${users.length} users total`)
          resolve(users)
        })
      })
    })
  }

  /**
   * 验证用户凭据
   */
  async authenticateUser(username, password) {
    try {
      // 先搜索用户获取DN
      await this.createConnection()
      await this.bind()

      const users = await this.searchUser(username)
      if (users.length === 0) {
        throw new Error('User not found')
      }

      // 修复DN提取逻辑，处理ldapjs的DN对象
      let userDN = users[0].dn
      if (userDN && typeof userDN === 'object') {
        // ldapjs返回的是DN对象，需要正确转换为字符串
        if (userDN.toString && typeof userDN.toString === 'function') {
          userDN = userDN.toString()
        } else if (userDN.format && typeof userDN.format === 'function') {
          userDN = userDN.format()
        } else {
          // 从dn对象中提取rdns信息手动构建DN字符串
          logger.info('User DN object structure:', JSON.stringify(userDN, null, 2))
          throw new Error('Unable to extract user DN from object')
        }
      } else if (typeof userDN !== 'string') {
        throw new Error('Invalid DN format')
      }

      logger.info(`Attempting to authenticate with DN: ${userDN}`)
      logger.info(`User sAMAccountName: ${users[0].sAMAccountName || users[0].username}`)
      logger.info(`User Account Control: ${users[0].userAccountControl}`)

      // 检查账户状态
      const userAccountControl = parseInt(users[0].userAccountControl) || 0
      if (userAccountControl & 2) {
        // UF_ACCOUNTDISABLE = 2
        throw new Error('User account is disabled')
      }

      // 断开管理员连接
      this.disconnect()

      // 尝试多种认证格式
      const sAMAccountName = users[0].sAMAccountName || users[0].username
      const authFormats = [
        sAMAccountName, // 直接使用sAMAccountName
        `${sAMAccountName}@corp.weidian-inc.com`, // UPN格式
        `${sAMAccountName}@weidian-inc.com`, // 简化UPN格式
        `corp\\${sAMAccountName}`, // 域\\用户名格式
        `CORP\\${sAMAccountName}`, // 大写域\\用户名格式
        `weidian-inc\\${sAMAccountName}`, // 完整域名\\用户名格式
        userDN // 完整DN（最后尝试）
      ].filter(Boolean)

      logger.info(`Trying authentication with formats: ${JSON.stringify(authFormats)}`)

      for (const authFormat of authFormats) {
        try {
          logger.info(`Attempting authentication with: ${authFormat}`)

          const userClient = ldap.createClient({
            url: this.config.url,
            timeout: 10000,
            connectTimeout: 10000,
            idleTimeout: 30000
          })

          const authResult = await new Promise((resolve, reject) => {
            let resolved = false

            // 设置错误处理
            userClient.on('error', (err) => {
              if (!resolved) {
                resolved = true
                logger.warn(`Connection error with ${authFormat}:`, err.message)
                userClient.destroy()
                reject(err)
              }
            })

            userClient.on('connect', () => {
              logger.info(`Connected for authentication with: ${authFormat}`)

              // 尝试使用用户凭据绑定
              userClient.bind(authFormat, password, (err) => {
                if (!resolved) {
                  resolved = true
                  if (err) {
                    logger.warn(
                      `Bind failed with ${authFormat}: ${err.name} - ${err.message} (Code: ${err.code})`
                    )
                    userClient.destroy()
                    reject(err)
                  } else {
                    logger.info(`Bind successful with ${authFormat}`)
                    userClient.unbind()
                    resolve(true)
                  }
                }
              })
            })

            // 超时处理
            setTimeout(() => {
              if (!resolved) {
                resolved = true
                userClient.destroy()
                reject(new Error('Authentication timeout'))
              }
            }, 5000)
          })

          if (authResult) {
            logger.info(`User ${username} authenticated successfully with format: ${authFormat}`)
            return {
              success: true,
              user: users[0]
            }
          }
        } catch (err) {
          logger.warn(
            `Authentication failed with format ${authFormat}: ${err.name} - ${err.message}`
          )
          continue
        }
      }

      // 所有格式都失败
      throw new Error('Invalid username or password')
    } catch (error) {
      logger.error('User authentication error:', error)
      throw error
    } finally {
      this.disconnect()
    }
  }

  /**
   * 关闭连接
   */
  disconnect() {
    if (this.client) {
      this.client.destroy()
      this.client = null
      logger.info('LDAP connection closed')
    }
  }

  /**
   * 列出所有OU
   */
  listOUs() {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        return reject(new Error('LDAP client not initialized'))
      }

      const searchOptions = {
        filter: '(objectClass=organizationalUnit)',
        scope: 'sub',
        attributes: ['ou', 'dn', 'objectClass', 'description']
      }

      // 从域根开始搜索所有OU
      const baseDN = 'DC=corp,DC=weidian-inc,DC=com'
      logger.info(`Searching for all OUs in: ${baseDN}`)

      this.client.search(baseDN, searchOptions, (err, res) => {
        if (err) {
          reject(err)
          return
        }

        const ous = []

        res.on('searchEntry', (entry) => {
          const obj = entry.object || {}
          const attrs = entry.attributes || []

          const getAttr = (name) => {
            if (obj[name]) {
              return obj[name]
            }
            const attr = attrs.find((a) => a.type === name)
            return attr ? (Array.isArray(attr.values) ? attr.values[0] : attr.values) : null
          }

          const ou = {
            dn: entry.dn,
            ou: getAttr('ou'),
            description: getAttr('description'),
            objectClass: getAttr('objectClass')
          }
          ous.push(ou)
        })

        res.on('referral', (referral) => {
          logger.info(`OUs search referral: ${referral}`)
        })

        res.on('error', (error) => {
          if (error.message && error.message.toLowerCase().includes('referral')) {
            logger.warn(`OUs search referral error (ignored): ${error.message}`)
            return
          }
          reject(error)
        })

        res.on('end', () => {
          logger.info(`Found ${ous.length} OUs total`)
          resolve(ous)
        })
      })
    })
  }

  /**
   * 验证OU是否存在
   */
  verifyOU(ouDN) {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        return reject(new Error('LDAP client not initialized'))
      }

      const searchOptions = {
        filter: '(objectClass=organizationalUnit)',
        scope: 'base',
        attributes: ['ou', 'dn', 'objectClass']
      }

      logger.info(`Searching for OU: ${ouDN}`)

      this.client.search(ouDN, searchOptions, (err, res) => {
        if (err) {
          reject(err)
          return
        }

        let found = false
        let ouInfo = null

        res.on('searchEntry', (entry) => {
          found = true
          ouInfo = {
            dn: entry.dn,
            ou: entry.object?.ou || entry.attributes?.find((a) => a.type === 'ou')?.values,
            objectClass:
              entry.object?.objectClass ||
              entry.attributes?.find((a) => a.type === 'objectClass')?.values
          }
        })

        res.on('referral', (referral) => {
          logger.info(`OU search referral: ${referral}`)
        })

        res.on('error', (error) => {
          if (error.message && error.message.toLowerCase().includes('referral')) {
            logger.warn(`OU search referral error (ignored): ${error.message}`)
            return
          }
          reject(error)
        })

        res.on('end', () => {
          resolve({
            exists: found,
            dn: ouDN,
            info: ouInfo
          })
        })
      })
    })
  }

  /**
   * 获取配置信息（不包含密码）
   */
  getConfig() {
    return {
      url: this.config.url,
      bindDN: this.config.bindDN,
      baseDN: this.config.baseDN,
      searchFilter: this.config.searchFilter,
      timeout: this.config.timeout,
      connectTimeout: this.config.connectTimeout
    }
  }
}

module.exports = new LDAPService()

const logger = require('../utils/logger')

/**
 * 用户映射服务 - 处理AD用户数据转换和过滤
 */
class UserMappingService {
  /**
   * 解析AD用户账户控制状态
   */
  static parseUserAccountControl(uac) {
    if (!uac) {
      return { disabled: true, description: 'Unknown' }
    }

    const uacValue = parseInt(uac)
    const flags = {
      SCRIPT: 0x00000001,
      ACCOUNTDISABLE: 0x00000002,
      HOMEDIR_REQUIRED: 0x00000008,
      LOCKOUT: 0x00000010,
      PASSWD_NOTREQD: 0x00000020,
      PASSWD_CANT_CHANGE: 0x00000040,
      ENCRYPTED_TEXT_PASSWORD_ALLOWED: 0x00000080,
      TEMP_DUPLICATE_ACCOUNT: 0x00000100,
      NORMAL_ACCOUNT: 0x00000200,
      INTERDOMAIN_TRUST_ACCOUNT: 0x00000800,
      WORKSTATION_TRUST_ACCOUNT: 0x00001000,
      SERVER_TRUST_ACCOUNT: 0x00002000,
      DONT_EXPIRE_PASSWD: 0x00010000,
      MNS_LOGON_ACCOUNT: 0x00020000,
      SMARTCARD_REQUIRED: 0x00040000,
      TRUSTED_FOR_DELEGATION: 0x00080000,
      NOT_DELEGATED: 0x00100000,
      USE_DES_KEY_ONLY: 0x00200000,
      DONT_REQUIRE_PREAUTH: 0x00400000,
      PASSWORD_EXPIRED: 0x00800000,
      TRUSTED_TO_AUTHENTICATE_FOR_DELEGATION: 0x01000000,
      PARTIAL_SECRETS_ACCOUNT: 0x04000000
    }

    const status = {
      disabled: !!(uacValue & flags.ACCOUNTDISABLE),
      locked: !!(uacValue & flags.LOCKOUT),
      passwordExpired: !!(uacValue & flags.PASSWORD_EXPIRED),
      normalAccount: !!(uacValue & flags.NORMAL_ACCOUNT),
      passwordNotRequired: !!(uacValue & flags.PASSWD_NOTREQD),
      dontExpirePassword: !!(uacValue & flags.DONT_EXPIRE_PASSWD),
      description: this.getUserAccountControlDescription(uacValue)
    }

    return status
  }

  /**
   * 获取用户账户控制的描述
   */
  static getUserAccountControlDescription(uac) {
    const uacValue = parseInt(uac)

    if (uacValue & 0x00000002) {
      return 'Account Disabled'
    }
    if (uacValue & 0x00000010) {
      return 'Account Locked'
    }
    if (uacValue & 0x00800000) {
      return 'Password Expired'
    }
    if (uacValue & 0x00000200) {
      return 'Normal User Account'
    }

    return `UAC: ${uacValue}`
  }

  /**
   * 过滤和映射AD用户数据
   * 模拟Python代码中的get_ad()函数逻辑
   */
  static mapAdUsers(searchResults) {
    if (!Array.isArray(searchResults)) {
      return []
    }

    // 移除第一个元素（Python代码中的slist.pop(0)）
    const userList = searchResults.slice(1)
    const mappedUsers = []

    for (const user of userList) {
      try {
        const userObj = {
          org: user.dn || user.distinguishedName,
          cn: null,
          userAccountControl: null,
          accountStatus: null
        }

        // 提取CN
        if (user.cn || user.CN) {
          userObj.cn = user.cn || user.CN
        } else {
          // 如果没有CN属性，跳过此用户
          continue
        }

        // 提取userAccountControl
        if (user.userAccountControl) {
          userObj.userAccountControl = user.userAccountControl
          userObj.accountStatus = this.parseUserAccountControl(user.userAccountControl)
        } else {
          // 如果没有userAccountControl，跳过此用户
          continue
        }

        mappedUsers.push(userObj)
      } catch (error) {
        logger.warn(`Error processing user entry: ${error.message}`, { user })
        continue
      }
    }

    return mappedUsers
  }

  /**
   * 过滤活跃用户（未禁用的账户）
   */
  static filterActiveUsers(users) {
    return users.filter((user) => user.accountStatus && !user.accountStatus.disabled)
  }

  /**
   * 根据用户名搜索（支持模糊匹配）
   */
  static searchUsersByName(users, searchTerm) {
    if (!searchTerm) {
      return users
    }

    const term = searchTerm.toLowerCase()
    return users.filter((user) => user.cn && user.cn.toLowerCase().includes(term))
  }

  /**
   * 格式化用户信息用于显示
   */
  static formatUserInfo(user) {
    return {
      name: user.cn,
      distinguishedName: user.org,
      accountControl: user.userAccountControl,
      status: user.accountStatus
        ? {
            enabled: !user.accountStatus.disabled,
            locked: user.accountStatus.locked,
            description: user.accountStatus.description
          }
        : null
    }
  }

  /**
   * 获取用户统计信息
   */
  static getUserStats(users) {
    const stats = {
      total: users.length,
      active: 0,
      disabled: 0,
      locked: 0,
      passwordExpired: 0
    }

    users.forEach((user) => {
      if (user.accountStatus) {
        if (!user.accountStatus.disabled) {
          stats.active++
        }
        if (user.accountStatus.disabled) {
          stats.disabled++
        }
        if (user.accountStatus.locked) {
          stats.locked++
        }
        if (user.accountStatus.passwordExpired) {
          stats.passwordExpired++
        }
      }
    })

    return stats
  }
}

module.exports = UserMappingService

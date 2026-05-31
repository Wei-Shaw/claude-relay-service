const fs = require('fs')
const bcrypt = require('bcryptjs')

const SALT_ROUNDS = 10

const toAdminCredentials = (initData) => {
  if (!initData.adminUsername || !initData.adminPasswordHash) {
    throw new Error('init.json is missing admin username or password hash')
  }

  return {
    username: initData.adminUsername,
    passwordHash: initData.adminPasswordHash,
    createdAt: initData.initializedAt || new Date().toISOString(),
    lastLogin: null,
    updatedAt: initData.updatedAt || null
  }
}

const writeInitData = (initFilePath, initData) => {
  fs.writeFileSync(initFilePath, JSON.stringify(initData, null, 2))
}

const createAdminInitData = async ({
  adminUsername,
  adminPassword,
  initializedAt = new Date().toISOString(),
  version = '1.0.0'
}) => ({
  initializedAt,
  adminUsername,
  adminPasswordHash: await bcrypt.hash(adminPassword, SALT_ROUNDS),
  version
})

const loadAdminCredentialsFromInitFile = async (initFilePath) => {
  const initData = JSON.parse(fs.readFileSync(initFilePath, 'utf8'))
  let shouldRewrite = false

  if (!initData.adminPasswordHash && initData.adminPassword) {
    initData.adminPasswordHash = await bcrypt.hash(initData.adminPassword, SALT_ROUNDS)
    initData.updatedAt = initData.updatedAt || new Date().toISOString()
    shouldRewrite = true
  }

  if (initData.adminPassword) {
    delete initData.adminPassword
    shouldRewrite = true
  }

  if (shouldRewrite) {
    writeInitData(initFilePath, initData)
  }

  return toAdminCredentials(initData)
}

const updateAdminCredentialsInInitFile = async (initFilePath, { adminUsername, adminPassword }) => {
  const initData = JSON.parse(fs.readFileSync(initFilePath, 'utf8'))
  const updatedAt = new Date().toISOString()

  initData.adminUsername = adminUsername
  initData.adminPasswordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS)
  initData.updatedAt = updatedAt
  delete initData.adminPassword

  writeInitData(initFilePath, initData)

  return toAdminCredentials(initData)
}

module.exports = {
  createAdminInitData,
  loadAdminCredentialsFromInitFile,
  updateAdminCredentialsInInitFile
}

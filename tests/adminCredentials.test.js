const fs = require('fs')
const os = require('os')
const path = require('path')
const bcrypt = require('bcryptjs')

const {
  createAdminInitData,
  loadAdminCredentialsFromInitFile,
  updateAdminCredentialsInInitFile
} = require('../src/utils/adminCredentials')

describe('admin credential init file storage', () => {
  const writeTempInitFile = (data) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mighty-admin-credentials-'))
    const filePath = path.join(dir, 'init.json')
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    return filePath
  }

  it('creates init data with a password hash instead of plaintext password', async () => {
    const initData = await createAdminInitData({
      adminUsername: 'admin',
      adminPassword: 'secret-password'
    })

    expect(initData.adminPassword).toBeUndefined()
    expect(initData.adminPasswordHash).toBeTruthy()
    await expect(bcrypt.compare('secret-password', initData.adminPasswordHash)).resolves.toBe(true)
  })

  it('migrates existing plaintext init files to hash-only storage', async () => {
    const filePath = writeTempInitFile({
      initializedAt: '2026-01-01T00:00:00.000Z',
      adminUsername: 'admin',
      adminPassword: 'old-secret',
      version: '1.0.0'
    })

    const credentials = await loadAdminCredentialsFromInitFile(filePath)
    const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'))

    expect(credentials.username).toBe('admin')
    expect(persisted.adminPassword).toBeUndefined()
    expect(persisted.adminPasswordHash).toBeTruthy()
    await expect(bcrypt.compare('old-secret', persisted.adminPasswordHash)).resolves.toBe(true)
  })

  it('updates passwords without writing plaintext back to init.json', async () => {
    const filePath = writeTempInitFile(
      await createAdminInitData({
        adminUsername: 'admin',
        adminPassword: 'old-secret'
      })
    )

    const credentials = await updateAdminCredentialsInInitFile(filePath, {
      adminUsername: 'renamed-admin',
      adminPassword: 'new-secret'
    })
    const persisted = JSON.parse(fs.readFileSync(filePath, 'utf8'))

    expect(credentials.username).toBe('renamed-admin')
    expect(persisted.adminUsername).toBe('renamed-admin')
    expect(persisted.adminPassword).toBeUndefined()
    await expect(bcrypt.compare('new-secret', persisted.adminPasswordHash)).resolves.toBe(true)
  })
})

const fs = require('fs')
const os = require('os')
const path = require('path')

const DEFAULT_SERVER = process.env.CLAUDE_RELAY_SERVER || 'http://127.0.0.1:3000'
const DEFAULT_PROFILE = 'default'
const CONFIG_VERSION = 2

function getConfigPath() {
  return (
    process.env.CLAUDE_RELAY_CLI_CONFIG ||
    path.join(os.homedir(), '.claude-relay-service', 'cli-auth.json')
  )
}

function normalizeServer(server) {
  if (!server || typeof server !== 'string') {
    throw new Error('server 不能为空')
  }

  const raw = server.trim()
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  const parsed = new URL(withProtocol)
  return `${parsed.protocol}//${parsed.host}`
}

function normalizeProfileName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('profile 名称不能为空')
  }

  const normalized = name.trim()
  if (!normalized) {
    throw new Error('profile 名称不能为空')
  }

  return normalized
}

function createDefaultProfile() {
  return {
    server: normalizeServer(DEFAULT_SERVER),
    token: '',
    username: ''
  }
}

function createDefaultStore() {
  return {
    version: CONFIG_VERSION,
    defaultProfile: DEFAULT_PROFILE,
    profiles: {
      [DEFAULT_PROFILE]: createDefaultProfile()
    }
  }
}

function normalizeProfileData(rawProfile, fallbackServer) {
  const profile = rawProfile && typeof rawProfile === 'object' ? rawProfile : {}
  return {
    server: normalizeServer(profile.server || fallbackServer),
    token: typeof profile.token === 'string' ? profile.token : '',
    username: typeof profile.username === 'string' ? profile.username : ''
  }
}

function normalizeStore(parsed) {
  const fallbackServer = normalizeServer(DEFAULT_SERVER)
  const defaults = createDefaultStore()
  let migrated = false

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !parsed.profiles) {
    if (parsed.server || parsed.token || parsed.username) {
      migrated = true
      return {
        migrated,
        store: {
          version: CONFIG_VERSION,
          defaultProfile: DEFAULT_PROFILE,
          profiles: {
            [DEFAULT_PROFILE]: normalizeProfileData(parsed, fallbackServer)
          }
        }
      }
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    migrated = true
    return { migrated, store: defaults }
  }

  const rawProfiles = parsed.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : {}
  const profiles = {}

  Object.keys(rawProfiles).forEach((rawName) => {
    const normalizedName = normalizeProfileName(rawName)
    profiles[normalizedName] = normalizeProfileData(rawProfiles[rawName], fallbackServer)
    if (normalizedName !== rawName) {
      migrated = true
    }
  })

  if (Object.keys(profiles).length === 0) {
    profiles[DEFAULT_PROFILE] = createDefaultProfile()
    migrated = true
  }

  const requestedDefault = parsed.defaultProfile ? normalizeProfileName(parsed.defaultProfile) : ''
  const hasDefault = requestedDefault && profiles[requestedDefault]
  const defaultProfile = hasDefault ? requestedDefault : Object.keys(profiles).sort()[0]

  if (!hasDefault || parsed.version !== CONFIG_VERSION) {
    migrated = true
  }

  return {
    migrated,
    store: {
      version: CONFIG_VERSION,
      defaultProfile,
      profiles
    }
  }
}

function loadAuthStore() {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) {
    return createDefaultStore()
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    const { store, migrated } = normalizeStore(parsed)
    if (migrated) {
      saveAuthStore(store)
    }
    return store
  } catch (error) {
    throw new Error(`读取 CLI 认证配置失败: ${error.message}`)
  }
}

function saveAuthStore(store) {
  const configPath = getConfigPath()
  const dir = path.dirname(configPath)

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(configPath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 })
  fs.chmodSync(configPath, 0o600)
}

function getProfile(store, profileName = '') {
  const resolvedName = profileName
    ? normalizeProfileName(profileName)
    : normalizeProfileName(store.defaultProfile || DEFAULT_PROFILE)
  const profile = store.profiles[resolvedName]
  if (!profile) {
    throw new Error(`profile 不存在: ${resolvedName}`)
  }
  return { profileName: resolvedName, profile }
}

function upsertProfile(store, profileName, patch = {}) {
  const name = normalizeProfileName(profileName)
  const base = store.profiles[name] || createDefaultProfile()
  store.profiles[name] = normalizeProfileData(
    {
      ...base,
      ...patch
    },
    normalizeServer(DEFAULT_SERVER)
  )
  if (!store.defaultProfile) {
    store.defaultProfile = name
  }
}

function setDefaultProfile(store, profileName) {
  const name = normalizeProfileName(profileName)
  if (!store.profiles[name]) {
    throw new Error(`profile 不存在: ${name}`)
  }
  store.defaultProfile = name
}

function removeProfile(store, profileName) {
  const name = normalizeProfileName(profileName)
  if (!store.profiles[name]) {
    throw new Error(`profile 不存在: ${name}`)
  }
  delete store.profiles[name]

  const names = Object.keys(store.profiles)
  if (names.length === 0) {
    store.profiles[DEFAULT_PROFILE] = createDefaultProfile()
    store.defaultProfile = DEFAULT_PROFILE
    return
  }

  if (store.defaultProfile === name) {
    store.defaultProfile = names.sort()[0]
  }
}

function listProfileNames(store) {
  return Object.keys(store.profiles).sort()
}

function loadAuthConfig() {
  const store = loadAuthStore()
  return getProfile(store).profile
}

function saveAuthConfig(config) {
  const store = loadAuthStore()
  const { profileName } = getProfile(store)
  upsertProfile(store, profileName, config)
  saveAuthStore(store)
}

module.exports = {
  getConfigPath,
  normalizeServer,
  normalizeProfileName,
  loadAuthStore,
  saveAuthStore,
  getProfile,
  upsertProfile,
  setDefaultProfile,
  removeProfile,
  listProfileNames,
  loadAuthConfig,
  saveAuthConfig
}

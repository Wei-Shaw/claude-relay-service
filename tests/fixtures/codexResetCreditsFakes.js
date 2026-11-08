// Synthetic in-memory Redis substitute. Never opens a socket or loads CRS config.
function createFakeRedis(accountId = 'synthetic-account', account = {}) {
  const values = new Map()
  const hash = { ...account }
  const calls = []
  return {
    values,
    hash,
    calls,
    async get(key) {
      calls.push(['get', key])
      return values.get(key) || null
    },
    async scan() {
      calls.push(['scan'])
      return ['0', [...values.keys()].filter((key) => key.startsWith('openai:codex-reset:'))]
    },
    async eval(script, count, ...args) {
      calls.push(['eval', script, count, ...args])
      const keys = args.slice(0, count)
      const argv = args.slice(count)
      if (script.includes('-- codex-reserve')) {
        if (values.has(keys[1])) {
          return 2
        }
        if (values.has(keys[0])) {
          return 0
        }
        values.set(keys[0], argv[0])
        values.set(keys[1], argv[1])
        return 1
      }
      if (script.includes('-- codex-save')) {
        if (values.get(keys[0]) !== argv[0]) {
          return 0
        }
        values.set(keys[1], argv[1])
        if (argv[2] === 'release') {
          values.delete(keys[0])
        }
        return 1
      }
      if (script.includes('-- codex-reconcile')) {
        if (values.get(keys[0]) !== argv[0] || values.get(keys[1]) !== argv[1]) {
          return 0
        }
        values.set(keys[1], argv[2])
        values.delete(keys[0])
        return 1
      }
      if (script.includes('-- codex-sync')) {
        if (
          keys[0] !== `openai:account:${accountId}` ||
          hash.accountId !== argv[0] ||
          hash.rateLimitStatus !== 'limited' ||
          (hash.rateLimitedAt || '') !== argv[1] ||
          (hash.rateLimitResetAt || '') !== argv[2]
        ) {
          return 0
        }
        if (
          hash.rateLimitOwnsSchedulable === 'true' &&
          hash.schedulable === 'false' &&
          hash.isActive === 'true' &&
          hash.status === 'active'
        ) {
          hash.schedulable = 'true'
        }
        hash.rateLimitStatus = 'normal'
        delete hash.rateLimitedAt
        delete hash.rateLimitResetAt
        delete hash.rateLimitOwnsSchedulable
        return 1
      }
      throw new Error('Unsupported synthetic Redis command')
    }
  }
}

module.exports = { createFakeRedis }

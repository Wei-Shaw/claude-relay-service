const { AsyncLocalStorage } = require('async_hooks')

const storage = new AsyncLocalStorage()

function runWithoutApiKeyUsage(callback) {
  return storage.run({ skipApiKeyUsage: true }, callback)
}

function shouldSkipApiKeyUsage() {
  return storage.getStore()?.skipApiKeyUsage === true
}

module.exports = {
  runWithoutApiKeyUsage,
  shouldSkipApiKeyUsage
}

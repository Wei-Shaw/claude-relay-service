/**
 * 🔄 Failover Wrapper Utility
 * Wraps request execution with automatic retry on upstream 5xx errors
 */

const failoverHelper = require('./failoverHelper')
const logger = require('./logger')

/**
 * Execute a request with automatic failover
 * @param {Object} options
 * @param {Object} options.req - Express request object
 * @param {Object} options.res - Express response object
 * @param {Function} options.selectAccount - Async function(excludeAccountIds) => { accountId, accountType, ... }
 * @param {Function} options.executeRequest - Async function(account) => void (should handle response)
 * @param {Function} options.markUnavailable - Async function(accountId, accountType, sessionHash, ttl) => void
 * @param {string} options.sessionHash - Optional session hash for sticky session cleanup
 * @param {string} options.platform - Platform name for logging (e.g., 'claude', 'gemini', 'openai')
 * @returns {Promise<void>}
 */
async function executeWithFailover(options) {
  const {
    req: _req,
    res,
    selectAccount,
    executeRequest,
    markUnavailable,
    sessionHash = null,
    platform: _platform = 'unknown'
  } = options

  // If failover is disabled, execute directly without retry logic
  if (!failoverHelper.isEnabled()) {
    const account = await selectAccount([])
    await executeRequest(account)
    return
  }

  const failoverContext = failoverHelper.createContext()
  const maxRetries = failoverHelper.getMaxRetries()
  const ttl = failoverHelper.getTempUnavailableTTL()

  for (;;) {
    let account = null

    try {
      // Select an account, excluding previously failed ones
      account = await selectAccount(failoverContext.excludeAccountIds)

      // Execute the request
      await executeRequest(account)

      // If we get here without error, request succeeded
      if (failoverContext.retryCount > 0) {
        failoverHelper.logSuccess({
          accountId: account.accountId,
          accountType: account.accountType,
          retryCount: failoverContext.retryCount
        })
      }
      return
    } catch (error) {
      // Check if this is a retryable upstream error
      const statusCode = error.statusCode || error.status
      const errorCode = error.code

      // Update context for retry decision
      const retryContext = {
        retryCount: failoverContext.retryCount,
        statusCode,
        errorCode,
        isStreamStarted: res.headersSent,
        error // 传递完整 error 对象，支持 noRetry/noFailover 标志
      }

      // If headers already sent, we cannot retry - just mark account unavailable
      if (res.headersSent) {
        if (account && failoverHelper.isRetryableError(error)) {
          logger.warn(
            '🔄 Failover: Stream already started, marking account unavailable but cannot retry'
          )
          await markUnavailable(account.accountId, account.accountType, sessionHash, ttl)
        }
        throw error
      }

      // Check if we should retry
      if (account && failoverHelper.shouldRetry(retryContext)) {
        // Mark the failed account as temporarily unavailable
        await markUnavailable(account.accountId, account.accountType, sessionHash, ttl)

        // Update failover context
        failoverContext.retryCount += 1
        failoverContext.excludeAccountIds.push(account.accountId)

        failoverHelper.logRetry({
          accountId: account.accountId,
          accountType: account.accountType,
          statusCode,
          errorCode,
          retryCount: failoverContext.retryCount,
          maxRetries
        })

        // Continue to next iteration to retry
        continue
      }

      // Cannot retry - log failure if we attempted retries
      if (failoverContext.retryCount > 0) {
        failoverHelper.logFailure({
          retryCount: failoverContext.retryCount,
          maxRetries,
          lastError: error
        })
      }

      // Re-throw the error
      throw error
    }
  }
}

module.exports = {
  executeWithFailover
}

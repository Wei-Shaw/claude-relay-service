const express = require('express')
const request = require('supertest')

jest.mock('../src/middleware/auth', () => ({
  authenticateAdmin: (req, _res, next) => {
    req.admin = { username: 'tester' }
    next()
  }
}))

jest.mock('../src/services/account/claudeAccountService', () => ({
  getAccount: jest.fn(),
  updateAccount: jest.fn()
}))
jest.mock('../src/services/account/claudeConsoleAccountService', () => ({
  getAccount: jest.fn(),
  updateAccount: jest.fn()
}))
jest.mock('../src/services/account/bedrockAccountService', () => ({
  getAccount: jest.fn(),
  updateAccount: jest.fn()
}))
jest.mock('../src/services/account/geminiAccountService', () => ({
  getAccount: jest.fn(),
  updateAccount: jest.fn()
}))
jest.mock('../src/services/account/geminiApiAccountService', () => ({
  getAccount: jest.fn(),
  updateAccount: jest.fn()
}))
jest.mock('../src/services/account/openaiAccountService', () => ({
  getAccount: jest.fn(),
  updateAccount: jest.fn()
}))
jest.mock('../src/services/account/openaiResponsesAccountService', () => ({
  getAccount: jest.fn(),
  updateAccount: jest.fn()
}))
jest.mock('../src/services/account/azureOpenaiAccountService', () => ({
  getAccount: jest.fn(),
  updateAccount: jest.fn()
}))
jest.mock('../src/services/account/ccrAccountService', () => ({
  getAccount: jest.fn(),
  updateAccount: jest.fn()
}))
jest.mock('../src/services/account/droidAccountService', () => ({
  getAccount: jest.fn(),
  updateAccount: jest.fn()
}))

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  audit: jest.fn()
}))

const claudeAccountService = require('../src/services/account/claudeAccountService')
const openaiAccountService = require('../src/services/account/openaiAccountService')
const azureOpenaiAccountService = require('../src/services/account/azureOpenaiAccountService')
const logger = require('../src/utils/logger')
const accountBatchRouter = require('../src/routes/admin/accountBatch')

describe('PUT /admin/accounts/batch-priority', () => {
  const buildApp = () => {
    const app = express()
    app.use(express.json())
    app.use('/admin', accountBatchRouter)
    return app
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 400 when accounts payload is empty', async () => {
    const app = buildApp()

    const response = await request(app).put('/admin/accounts/batch-priority').send({
      accounts: [],
      priority: 10
    })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      success: false,
      message: 'accounts must be a non-empty array'
    })
  })

  it('returns 400 when priority is out of range', async () => {
    const app = buildApp()

    const response = await request(app).put('/admin/accounts/batch-priority').send({
      accounts: [{ accountId: 'claude-1', platform: 'claude' }],
      priority: 101
    })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      success: false,
      message: 'priority must be an integer between 1 and 100'
    })
  })

  it('supports mixed platforms and skips accounts whose priority is unchanged', async () => {
    const app = buildApp()

    claudeAccountService.getAccount.mockResolvedValue({
      id: 'claude-1',
      name: 'Claude One',
      priority: '30'
    })
    claudeAccountService.updateAccount.mockResolvedValue({ id: 'claude-1' })

    openaiAccountService.getAccount.mockResolvedValue({
      id: 'openai-1',
      name: 'OpenAI One',
      priority: '10'
    })

    const response = await request(app).put('/admin/accounts/batch-priority').send({
      accounts: [
        { accountId: 'claude-1', platform: 'claude' },
        { accountId: 'openai-1', platform: 'openai' }
      ],
      priority: 10
    })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      priority: 10,
      totalCount: 2,
      successCount: 1,
      skippedCount: 1,
      failedCount: 0
    })
    expect(claudeAccountService.updateAccount).toHaveBeenCalledWith('claude-1', { priority: 10 })
    expect(openaiAccountService.updateAccount).not.toHaveBeenCalled()
    expect(logger.audit).toHaveBeenCalledWith(
      '批量更新账户优先级',
      expect.objectContaining({
        admin: 'tester',
        successCount: 1,
        skippedCount: 1,
        failedCount: 0
      })
    )
  })

  it('normalizes azure-openai alias and keeps failure details when partial errors happen', async () => {
    const app = buildApp()

    azureOpenaiAccountService.getAccount.mockResolvedValue({
      id: 'azure-1',
      name: 'Azure One',
      priority: '50'
    })
    azureOpenaiAccountService.updateAccount.mockResolvedValue({ id: 'azure-1', priority: 5 })

    const response = await request(app).put('/admin/accounts/batch-priority').send({
      accounts: [
        { accountId: 'azure-1', platform: 'azure-openai' },
        { accountId: 'unknown-1', platform: 'unknown-platform' }
      ],
      priority: 5
    })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      priority: 5,
      totalCount: 2,
      successCount: 1,
      skippedCount: 0,
      failedCount: 1
    })
    expect(azureOpenaiAccountService.updateAccount).toHaveBeenCalledWith('azure-1', {
      priority: 5
    })
    expect(response.body.data.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          success: true,
          accountId: 'azure-1',
          platform: 'azure_openai'
        }),
        expect.objectContaining({
          success: false,
          accountId: 'unknown-1',
          platform: 'unknown-platform',
          message: 'Unsupported platform'
        })
      ])
    )
  })
})

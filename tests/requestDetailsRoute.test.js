const mockRouter = {
  get: jest.fn(),
  post: jest.fn()
}

jest.mock(
  'express',
  () => ({
    Router: () => mockRouter
  }),
  { virtual: true }
)

jest.mock('../src/middleware/auth', () => ({
  authenticateAdmin: jest.fn((_req, _res, next) => next())
}))

jest.mock('../src/services/requestDetailService', () => ({
  listRequestDetails: jest.fn(),
  getRequestDetail: jest.fn(),
  getRequestBodyPreviewStats: jest.fn(),
  purgeRequestBodySnapshots: jest.fn()
}))

jest.mock('../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  start: jest.fn()
}))

const requestDetailService = require('../src/services/requestDetailService')
require('../src/routes/admin/requestDetails')

function createResponse() {
  const res = {
    statusCode: 200,
    body: null,
    json: jest.fn((payload) => {
      res.body = payload
      return res
    }),
    status: jest.fn((code) => {
      res.statusCode = code
      return res
    })
  }
  return res
}

function findGetHandler(path) {
  const route = mockRouter.get.mock.calls.find((call) => call[0] === path)
  return route?.[2]
}

function findPostHandler(path) {
  const route = mockRouter.post.mock.calls.find((call) => call[0] === path)
  return route?.[2]
}

describe('requestDetails admin routes', () => {
  beforeEach(() => {
    requestDetailService.listRequestDetails.mockReset()
    requestDetailService.getRequestDetail.mockReset()
    requestDetailService.getRequestBodyPreviewStats.mockReset()
    requestDetailService.purgeRequestBodySnapshots.mockReset()
  })

  test('returns 400 for invalid request detail queries', async () => {
    const error = new Error('Invalid date range')
    error.statusCode = 400
    requestDetailService.listRequestDetails.mockRejectedValue(error)

    const handler = findGetHandler('/request-details')
    const res = createResponse()

    await handler({ query: { startDate: 'bad' } }, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe('Invalid date range')
  })

  test('returns retained detail records even when capture is disabled', async () => {
    requestDetailService.getRequestDetail.mockResolvedValue({
      captureEnabled: false,
      retentionHours: 6,
      record: {
        requestId: 'req_1',
        model: 'gpt-5.4'
      }
    })

    const handler = findGetHandler('/request-details/:requestId')
    const res = createResponse()

    await handler({ params: { requestId: 'req_1' } }, res)

    expect(res.status).not.toHaveBeenCalled()
    expect(res.body.success).toBe(true)
    expect(res.body.data.captureEnabled).toBe(false)
    expect(res.body.data.record.requestId).toBe('req_1')
  })

  test('returns request body preview stats', async () => {
    requestDetailService.getRequestBodyPreviewStats.mockResolvedValue({
      captureEnabled: true,
      retentionHours: 6,
      bodyPreviewEnabled: false,
      snapshotCount: 3,
      hasSnapshots: true
    })

    const handler = findGetHandler('/request-details/body-preview-stats')
    const res = createResponse()

    await handler({}, res)

    expect(res.status).not.toHaveBeenCalled()
    expect(res.body.success).toBe(true)
    expect(res.body.data.snapshotCount).toBe(3)
    expect(res.body.data.hasSnapshots).toBe(true)
  })

  test('purges stored request body previews via dedicated route', async () => {
    requestDetailService.purgeRequestBodySnapshots.mockResolvedValue({
      updatedRecords: 7
    })

    const handler = findPostHandler('/request-details/body-preview-purge')
    const res = createResponse()

    await handler({}, res)

    expect(res.status).not.toHaveBeenCalled()
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe('清理完毕')
    expect(res.body.data.updatedRecords).toBe(7)
  })
})

const dns = require('dns')

const mockSendMail = jest.fn()

jest.mock('axios', () => ({
  post: jest.fn()
}))

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail
  }))
}))

jest.mock('../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  security: jest.fn(),
  api: jest.fn()
}))

jest.mock('../src/services/webhookConfigService', () => ({
  getConfig: jest.fn(),
  getEnabledPlatforms: jest.fn()
}))

jest.mock('../config/config', () => ({
  system: {
    timezone: 'UTC'
  }
}))

const axios = require('axios')
const nodemailer = require('nodemailer')
const webhookService = require('../src/services/webhookService')

describe('webhook outbound network policy', () => {
  let lookupSpy

  beforeEach(() => {
    jest.clearAllMocks()
    lookupSpy = jest.spyOn(dns.promises, 'lookup')
  })

  afterEach(() => {
    lookupSpy.mockRestore()
  })

  it('blocks direct loopback webhook URLs before axios is called', async () => {
    await expect(
      webhookService.sendHttpRequest('http://127.0.0.1/internal-probe', { ok: true }, 1000)
    ).rejects.toThrow(/blocked address/)

    expect(axios.post).not.toHaveBeenCalled()
  })

  it('blocks hostnames that resolve to private addresses', async () => {
    lookupSpy.mockResolvedValue([{ address: '10.0.0.5', family: 4 }])

    await expect(
      webhookService.sendHttpRequest('https://hooks.example.test/webhook', { ok: true }, 1000)
    ).rejects.toThrow(/blocked address 10\.0\.0\.5/)

    expect(axios.post).not.toHaveBeenCalled()
  })

  it('pins validated DNS records and disables redirects for allowed webhook URLs', async () => {
    lookupSpy.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    axios.post.mockResolvedValue({ status: 204, statusText: 'No Content', data: { ok: true } })

    const response = await webhookService.sendHttpRequest(
      'https://hooks.example.test/webhook',
      { ok: true },
      1234,
      {
        headers: { 'X-Test': '1' },
        maxRedirects: 5,
        lookup: jest.fn()
      }
    )

    expect(response).toEqual({ ok: true })
    expect(axios.post).toHaveBeenCalledWith(
      'https://hooks.example.test/webhook',
      { ok: true },
      expect.objectContaining({
        timeout: 1234,
        maxRedirects: 0,
        lookup: expect.any(Function),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'User-Agent': 'claude-relay-service/2.0',
          'X-Test': '1'
        })
      })
    )
  })

  it('blocks SMTP hosts that point at loopback', async () => {
    await expect(
      webhookService.sendToSMTP(
        {
          host: '127.0.0.1',
          port: 25,
          user: 'sender@example.com',
          pass: 'secret',
          to: 'receiver@example.com'
        },
        'test',
        {}
      )
    ).rejects.toThrow(/blocked address/)

    expect(nodemailer.createTransport).not.toHaveBeenCalled()
  })

  it('blocks Telegram proxy URLs that point at loopback', async () => {
    await expect(
      webhookService.buildTelegramAxiosOptions({ proxyUrl: 'socks5://127.0.0.1:1080' })
    ).rejects.toThrow(/blocked address/)
  })
})

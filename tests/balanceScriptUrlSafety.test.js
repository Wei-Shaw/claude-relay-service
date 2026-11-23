const axios = require('axios')
const balanceScriptService = require('../src/services/balanceScriptService')

jest.mock('axios', () => jest.fn())

describe('balance script request URL safety', () => {
  beforeAll(() => {
    process.env.BALANCE_SCRIPT_ENABLED = 'true'
  })

  afterAll(() => {
    delete process.env.BALANCE_SCRIPT_ENABLED
  })

  beforeEach(() => {
    axios.mockReset()
    axios.mockResolvedValue({ status: 200, headers: {}, data: { balance: 1 } })
  })

  const run = (url) =>
    balanceScriptService.execute({
      scriptBody: `({ request: { url: '${url}' }, extractor: (r) => ({ remaining: r.balance }) })`,
      timeoutSeconds: 1
    })

  test.each([
    'http://[::1]:6379/',
    'http://[::ffff:127.0.0.1]:6379/',
    'http://[fd00::1]/',
    'http://127.0.0.1:6379/'
  ])('refuses to call loopback/private address %s', async (url) => {
    await expect(run(url)).rejects.toThrow(/不安全/)
    expect(axios).not.toHaveBeenCalled()
  })

  test('still allows a public URL', async () => {
    const result = await run('https://api.example.com/balance')
    expect(axios).toHaveBeenCalledTimes(1)
    expect(result.mapped.balance).toBe(1)
  })
})

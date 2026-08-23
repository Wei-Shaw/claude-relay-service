// 账户迁移格式转换回归：
// 1) parsers 能从 JSON 头/结构识别 CRS / sub2api / CLIProxyAPI 三种来源；
// 2) mappers 在 CRS 快照 <-> 外部格式之间往返时，关键凭据字段不丢失、平台/类型判定正确；
// 3) 不支持的平台（如 bedrock 导出为 auth 文件）返回 unsupported 而非抛错。

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn()
}))

const parsers = require('../src/services/accountMigrationParsers')
const mappers = require('../src/services/accountMigrationMappers')

const b64 = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64')

describe('accountMigrationParsers.detectFormatFromJson', () => {
  test('CRS 头识别为 crs', () => {
    expect(parsers.detectFormatFromJson({ type: 'crs-accounts', accounts: [] })).toBe(
      parsers.FORMAT.CRS
    )
  })

  test('sub2api 头识别为 sub2api', () => {
    expect(parsers.detectFormatFromJson({ type: 'sub2api-data', accounts: [] })).toBe(
      parsers.FORMAT.SUB2API
    )
  })

  test('CLIProxyAPI 单文件按 type 识别', () => {
    expect(parsers.detectFormatFromJson({ type: 'claude', access_token: 'x' })).toBe(
      parsers.FORMAT.CLIPROXYAPI_JSON
    )
  })

  test('无法识别返回 unknown', () => {
    expect(parsers.detectFormatFromJson({ foo: 'bar' })).toBe(parsers.FORMAT.UNKNOWN)
  })
})

describe('accountMigrationParsers.parseImportPayload', () => {
  test('解析 base64 JSON 并打上 format 标签', () => {
    const parsed = parsers.parseImportPayload({
      filename: 'export.json',
      contentBase64: b64({ type: 'crs-accounts', version: 1, accounts: [] })
    })
    expect(parsed.format).toBe(parsers.FORMAT.CRS)
    expect(parsed.json.accounts).toEqual([])
  })
})

// ===================== 迁移服务内部件（代理去重 / droid 指纹） =====================
// 纯函数路径不触达 redis/account services，mock 掉以避免 require 副作用

jest.mock('../src/models/redis', () => ({}))
jest.mock('../src/services/account/claudeAccountService', () => ({}))
jest.mock('../src/services/account/claudeConsoleAccountService', () => ({}))
jest.mock('../src/services/account/ccrAccountService', () => ({}))
jest.mock('../src/services/account/openaiAccountService', () => ({}))
jest.mock('../src/services/account/openaiResponsesAccountService', () => ({}))
jest.mock('../src/services/account/geminiAccountService', () => ({}))
jest.mock('../src/services/account/geminiApiAccountService', () => ({}))
jest.mock('../src/services/account/azureOpenaiAccountService', () => ({}))
jest.mock('../src/services/account/bedrockAccountService', () => ({}))
jest.mock('../src/services/account/droidAccountService', () => ({}))

const { _internal } = require('../src/services/accountMigrationService')

const geminiApiSnap = (id, proxy) => ({
  platform: 'gemini-api',
  id,
  name: `acc-${id}`,
  description: '',
  data: { apiKey: `key-${id}`, proxy }
})

describe('accountMigrationService.buildSub2apiExport 代理去重', () => {
  test('同地址不同认证不合并，相同认证复用 proxy_key', () => {
    const out = _internal.buildSub2apiExport(
      [
        geminiApiSnap('1', {
          protocol: 'http',
          host: '10.0.0.1',
          port: 8080,
          username: 'u1',
          password: 'p1'
        }),
        geminiApiSnap('2', {
          protocol: 'http',
          host: '10.0.0.1',
          port: 8080,
          username: 'u2',
          password: 'p2'
        }),
        geminiApiSnap('3', {
          protocol: 'http',
          host: '10.0.0.1',
          port: 8080,
          username: 'u1',
          password: 'p1'
        })
      ],
      '2026-06-04T00:00:00.000Z',
      []
    )
    expect(out.payload.proxies).toHaveLength(2)
    const [a1, a2, a3] = out.payload.accounts
    expect(a1.proxy_key).not.toBe(a2.proxy_key)
    expect(a3.proxy_key).toBe(a1.proxy_key)
  })
})

describe('accountMigrationService.snapshotFingerprint droid', () => {
  const droidSnap = (data) => ({ platform: 'droid', data })

  test('API key 模式指纹非空、与 key 顺序无关', () => {
    const a = _internal.snapshotFingerprint(droidSnap({ apiKeys: ['k2', 'k1'] }))
    const b = _internal.snapshotFingerprint(droidSnap({ apiKeys: ['k1', 'k2'] }))
    expect(a).not.toBe('')
    expect(a).toBe(b)
  })

  test('不同 apiKeys 指纹不同；refreshToken 模式优先用 refreshToken', () => {
    const a = _internal.snapshotFingerprint(droidSnap({ apiKeys: ['k1'] }))
    const b = _internal.snapshotFingerprint(droidSnap({ apiKeys: ['k9'] }))
    expect(a).not.toBe(b)
    const c = _internal.snapshotFingerprint(droidSnap({ refreshToken: 'rt', apiKeys: ['k1'] }))
    const d = _internal.snapshotFingerprint(droidSnap({ refreshToken: 'rt' }))
    expect(c).toBe(d)
  })

  test('同 apiKeys 不同 endpointType 是不同账户；缺省按 anthropic 与读取侧一致', () => {
    const a = _internal.snapshotFingerprint(
      droidSnap({ apiKeys: ['k1'], endpointType: 'anthropic' })
    )
    const b = _internal.snapshotFingerprint(droidSnap({ apiKeys: ['k1'], endpointType: 'openai' }))
    expect(a).not.toBe(b)
    const c = _internal.snapshotFingerprint(droidSnap({ apiKeys: ['k1'] }))
    expect(c).toBe(a)
  })
})

describe('accountMigrationMappers sub2api openai apikey/upstream -> CRS', () => {
  test('纯 sub2api 文件（无 provider_endpoint）映射为 openai-responses 且 providerEndpoint=auto', () => {
    for (const type of ['apikey', 'upstream']) {
      const r = mappers.sub2apiToCrsSnapshot({
        platform: 'openai',
        type,
        name: 'gw',
        credentials: { api_key: 'sk-1', base_url: 'https://gw.example.com/v1' }
      })
      expect(r.ok).toBe(true)
      expect(r.snapshot.platform).toBe(mappers.CRS_PLATFORM.OPENAI_RESPONSES)
      expect(r.snapshot.data.providerEndpoint).toBe('auto')
      expect(r.snapshot.data.apiKey).toBe('sk-1')
    }
  })
})

describe('openai-responses providerEndpoint 往返与更新透传', () => {
  test('CRS -> sub2api -> CRS 往返不漂移', () => {
    for (const endpoint of ['responses', 'auto']) {
      const exp = mappers.crsSnapshotToSub2api({
        platform: 'openai-responses',
        id: 'x',
        name: 'resp',
        description: '',
        data: { apiKey: 'sk-1', baseApi: 'https://u.example.com', providerEndpoint: endpoint }
      })
      expect(exp.ok).toBe(true)
      expect(exp.account.credentials.provider_endpoint).toBe(endpoint)
      const back = mappers.sub2apiToCrsSnapshot(exp.account)
      expect(back.ok).toBe(true)
      expect(back.snapshot.data.providerEndpoint).toBe(endpoint)
    }
  })

  test('旧账户无 providerEndpoint 时按运行语义落盘 responses', () => {
    const exp = mappers.crsSnapshotToSub2api({
      platform: 'openai-responses',
      id: 'x',
      name: 'legacy',
      description: '',
      data: { apiKey: 'sk-1', baseApi: 'https://u.example.com' }
    })
    expect(exp.account.credentials.provider_endpoint).toBe('responses')
  })

  test('重复导入命中 update 时透传 providerEndpoint', () => {
    const u = _internal.buildUpdatePayload({
      platform: 'openai-responses',
      data: { apiKey: 'sk-1', providerEndpoint: 'auto' }
    })
    expect(u.providerEndpoint).toBe('auto')
  })
})

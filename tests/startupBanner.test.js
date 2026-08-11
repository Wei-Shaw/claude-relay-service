// 回归：启动横幅按实际监听地址推导 Local/Network，且完整识别回环网段。
//
// Bug: 回环判定只匹配 127.0.0.1，绑定 127.0.0.2（属 127.0.0.0/8）或展开形式 IPv6 回环
// 会被错误输出为 Network（外部主机连不上）。
// Fix: isLoopbackHost 覆盖整个 127.0.0.0/8、localhost、::1 及展开/映射写法。

const {
  isLoopbackHost,
  getBannerEndpoints,
  getLanIPv4Candidates
} = require('../src/utils/startupBanner')

describe('isLoopbackHost 回环识别', () => {
  it.each([
    '127.0.0.1',
    '127.0.0.2',
    '127.1.2.3',
    'localhost',
    '::1',
    '[::1]',
    '0:0:0:0:0:0:0:1',
    '0000:0000:0000:0000:0000:0000:0000:0001',
    // 部分压缩形式（此前被漏判为 Network）
    '0:0:0:0:0:0::1',
    '0:0:0::1',
    '::0:1',
    '0::1',
    // IPv4-mapped 回环
    '::ffff:127.0.0.1',
    '::ffff:127.5.5.5',
    // 带方括号 + zone id
    '[::1]%lo0'
  ])('识别 %s 为回环', (host) => {
    expect(isLoopbackHost(host)).toBe(true)
  })

  it.each([
    '192.168.1.5',
    '10.0.0.1',
    '0.0.0.0',
    '::',
    '128.0.0.1',
    '27.0.0.1',
    '',
    null,
    undefined,
    // 尾部形似 127.x 但非 IPv4-mapped，绝不能误判为回环（反向误判回归）
    '2001:db8::127.0.0.1',
    // IPv4-mapped 但非 127 段
    '::ffff:192.168.1.1',
    'fe80::1',
    'fe80::1%eth0',
    '::2',
    '256.0.0.1',
    'gggg::1'
  ])('识别 %s 为非回环', (host) => {
    expect(isLoopbackHost(host)).toBe(false)
  })
})

describe('getBannerEndpoints Local/Network 推导', () => {
  const multiNic = {
    eth: [
      { family: 'IPv4', internal: false, address: '192.168.1.5' },
      { family: 'IPv4', internal: false, address: '172.20.0.1' }
    ],
    lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }]
  }
  const noNic = { lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }] }

  it('通配 0.0.0.0：Local=localhost + 所有局域网 IP 作 Network', () => {
    expect(getBannerEndpoints('0.0.0.0', multiNic)).toEqual({
      local: 'localhost',
      networks: ['192.168.1.5', '172.20.0.1']
    })
  })

  it('通配 :: 无网卡：仅 Local，不产生非法 URL', () => {
    expect(getBannerEndpoints('::', noNic)).toEqual({ local: 'localhost', networks: [] })
  })

  it('回环 127.0.0.1：仅 Local，无 Network', () => {
    expect(getBannerEndpoints('127.0.0.1', multiNic)).toEqual({ local: 'localhost', networks: [] })
  })

  it('回环 127.0.0.2（127/8 网段）：仅 Local，不被误判为 Network', () => {
    expect(getBannerEndpoints('127.0.0.2', multiNic)).toEqual({ local: 'localhost', networks: [] })
  })

  it('指定 IP：仅 Network（无 localhost）', () => {
    expect(getBannerEndpoints('192.168.1.9', multiNic)).toEqual({
      local: null,
      networks: ['192.168.1.9']
    })
  })

  it('指定 IPv6：作 Network 且加方括号', () => {
    expect(getBannerEndpoints('fe80::1', multiNic)).toEqual({
      local: null,
      networks: ['[fe80::1]']
    })
  })
})

describe('getLanIPv4Candidates', () => {
  it('私有网段排在前，跳过 internal 与非 IPv4', () => {
    const nics = {
      eth0: [
        { family: 'IPv4', internal: false, address: '203.0.113.5' }, // 公网
        { family: 'IPv6', internal: false, address: 'fe80::1' } // 非 IPv4，跳过
      ],
      eth1: [{ family: 'IPv4', internal: false, address: '192.168.0.2' }], // 私有
      lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }] // internal，跳过
    }
    expect(getLanIPv4Candidates(nics)).toEqual(['192.168.0.2', '203.0.113.5'])
  })
})

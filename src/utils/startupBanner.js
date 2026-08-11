// 启动横幅地址推导（纯函数，便于单测）。对齐参考项目 llysc 的 Local:/Network: 输出契约。
const os = require('os')

// 收集所有非回环 IPv4 网卡地址，私有网段（192.168/10/172.16-31）排在前面。
// 说明：无法可靠区分物理网卡 / Docker / WSL / Hyper-V / VPN，故不猜单一地址，全部列出交用户判断。
// interfaces 可注入（默认取 os.networkInterfaces()），便于测试。
const getLanIPv4Candidates = (interfaces = os.networkInterfaces()) => {
  const priv = []
  const other = []
  const isPrivate = (ip) =>
    ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
  for (const iface of Object.values(interfaces || {})) {
    if (!Array.isArray(iface)) {
      continue
    }
    for (const info of iface) {
      if (!info.internal && info.family === 'IPv4') {
        ;(isPrivate(info.address) ? priv : other).push(info.address)
      }
    }
  }
  return [...priv, ...other]
}

// IPv6 字面量需加方括号才能构成合法 URL host（如 ::1 → [::1]）
const toUrlHost = (host) => (host && host.includes(':') ? `[${host}]` : host)

// 判断是否 127.0.0.0/8 IPv4 回环
const isIPv4Loopback = (addr) => {
  const m = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) {
    return false
  }
  const parts = m.slice(1).map(Number)
  if (parts.some((n) => n > 255)) {
    return false
  }
  return parts[0] === 127
}

// 把 IPv6 地址展开为 8 组 16 位数值（处理 :: 压缩、内嵌 IPv4、zone id、方括号）；非法返回 null。
// 返回 { groups: number[8], embeddedV4: number[4]|null }。用数值判定，避免字符串尾部匹配的假阴/假阳。
const expandIPv6 = (input) => {
  // 先去 zone id（%lo0 等），再去方括号——顺序不能反，否则 [::1]%lo0 的尾括号会残留
  let s = input
  const zone = s.indexOf('%')
  if (zone >= 0) {
    s = s.slice(0, zone)
  }
  s = s.replace(/^\[|\]$/g, '')
  if (s === '' || !s.includes(':')) {
    return null
  }

  // 尾部内嵌 IPv4（如 ::ffff:127.0.0.1）转成两组 16 位后再按 hextet 解析
  let embeddedV4 = null
  const v4 = s.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (v4) {
    const b = v4[1].split('.').map(Number)
    if (b.some((n) => n > 255)) {
      return null
    }
    embeddedV4 = b
    const hextets = `${((b[0] << 8) | b[1]).toString(16)}:${((b[2] << 8) | b[3]).toString(16)}`
    s = s.slice(0, s.length - v4[1].length) + hextets
  }

  const halves = s.split('::')
  if (halves.length > 2) {
    return null
  }
  const toGroups = (str) => (str === '' ? [] : str.split(':'))
  const head = toGroups(halves[0])
  let groups
  if (halves.length === 2) {
    const tail = toGroups(halves[1])
    const missing = 8 - head.length - tail.length
    if (missing < 0) {
      return null
    }
    groups = [...head, ...Array(missing).fill('0'), ...tail]
  } else {
    groups = head
  }
  if (groups.length !== 8) {
    return null
  }
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN))
  if (nums.some((n) => Number.isNaN(n))) {
    return null
  }
  return { groups: nums, embeddedV4 }
}

// 判断是否回环地址：localhost、整个 127.0.0.0/8、::1（任意压缩/展开形式）、
// 以及 IPv4-mapped ::ffff:127.x.x.x。规范化后按数值判定，不用脆弱的尾部正则。
const isLoopbackHost = (host) => {
  if (!host) {
    return false
  }
  const h = host.toLowerCase().trim()
  if (h === 'localhost') {
    return true
  }
  if (!h.includes(':')) {
    return isIPv4Loopback(h)
  }
  const parsed = expandIPv6(h)
  if (!parsed) {
    return false
  }
  const g = parsed.groups
  // ::1（前 7 组为 0，末组为 1）
  if (g.slice(0, 7).every((n) => n === 0) && g[7] === 1) {
    return true
  }
  // IPv4-mapped ::ffff:127.x.x.x（前 5 组 0、第 6 组 0xffff，内嵌 IPv4 属 127/8）
  if (
    parsed.embeddedV4 &&
    g[0] === 0 &&
    g[1] === 0 &&
    g[2] === 0 &&
    g[3] === 0 &&
    g[4] === 0 &&
    g[5] === 0xffff
  ) {
    return parsed.embeddedV4[0] === 127
  }
  return false
}

// 根据实际监听地址推导横幅要展示的 Local / Network 主机（对齐 llysc 的 Local:/Network: 契约）。
//   - 通配（0.0.0.0 / ::）：Local=localhost，Network=所有局域网 IPv4（逐条列出，用户自行识别物理网卡/Docker/WSL/VPN）
//   - 回环（127.0.0.0/8 / ::1 / localhost）：仅 Local=localhost，无 Network（打了也连不上）
//   - 指定 IP：该地址作为 Network（非回环时无 localhost）
// 返回 { local, networks }，host 已做 IPv6 方括号处理；两者可能为空。interfaces 可注入便于测试。
const getBannerEndpoints = (bindHost, interfaces) => {
  const isWildcard = bindHost === '0.0.0.0' || bindHost === '::' || bindHost === ''
  if (isWildcard) {
    const networks = [...new Set(getLanIPv4Candidates(interfaces).map(toUrlHost))].filter(Boolean)
    return { local: 'localhost', networks }
  }
  if (isLoopbackHost(bindHost)) {
    return { local: 'localhost', networks: [] }
  }
  // 指定 IP：仅该地址可访问，作为 Network（无 localhost）
  return { local: null, networks: [toUrlHost(bindHost)] }
}

module.exports = {
  getLanIPv4Candidates,
  toUrlHost,
  isLoopbackHost,
  getBannerEndpoints
}

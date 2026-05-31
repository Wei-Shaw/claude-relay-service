const dns = require('dns')
const dnsPromises = dns.promises
const net = require('net')

const blockedAddresses = new net.BlockList()

for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
]) {
  blockedAddresses.addSubnet(address, prefix, 'ipv4')
}
blockedAddresses.addAddress('255.255.255.255', 'ipv4')

blockedAddresses.addAddress('::', 'ipv6')
blockedAddresses.addAddress('::1', 'ipv6')
for (const [address, prefix] of [
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8]
]) {
  blockedAddresses.addSubnet(address, prefix, 'ipv6')
}

function normalizeHostname(hostname) {
  return String(hostname || '')
    .trim()
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/\.$/, '')
    .toLowerCase()
}

function getIpLiteral(hostname) {
  const normalized = normalizeHostname(hostname)
  return net.isIP(normalized) ? normalized : null
}

function isBlockedIp(address) {
  const normalized = normalizeHostname(address)
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mappedIpv4) {
    return isBlockedIp(mappedIpv4[1])
  }

  const family = net.isIP(normalized)
  if (family === 4) {
    return blockedAddresses.check(normalized, 'ipv4')
  }
  if (family === 6) {
    return blockedAddresses.check(normalized, 'ipv6')
  }

  return false
}

function createPinnedLookup(expectedHostname, records) {
  const normalizedExpected = normalizeHostname(expectedHostname)
  const pinnedRecords = records.map((record) => ({
    address: record.address,
    family: record.family
  }))

  return (hostname, options, callback) => {
    let lookupOptions = options
    let done = callback

    if (typeof lookupOptions === 'function') {
      done = lookupOptions
      lookupOptions = {}
    } else if (typeof lookupOptions === 'number') {
      lookupOptions = { family: lookupOptions }
    }

    const normalizedRequest = normalizeHostname(hostname)
    if (normalizedRequest !== normalizedExpected) {
      return done(new Error(`Outbound lookup host mismatch for ${hostname}`))
    }

    const requestedFamily = lookupOptions?.family
    const matchingRecords = requestedFamily
      ? pinnedRecords.filter((record) => record.family === requestedFamily)
      : pinnedRecords

    if (matchingRecords.length === 0) {
      return done(new Error(`No validated address for ${hostname}`))
    }

    if (lookupOptions?.all) {
      return done(null, matchingRecords)
    }

    return done(null, matchingRecords[0].address, matchingRecords[0].family)
  }
}

async function resolveOutboundHost(hostname, target = 'Outbound host') {
  const normalizedHostname = normalizeHostname(hostname)
  if (!normalizedHostname) {
    throw new Error(`${target} is missing a hostname`)
  }

  if (normalizedHostname === 'localhost' || normalizedHostname.endsWith('.localhost')) {
    throw new Error(`${target} uses a blocked local hostname`)
  }

  const literalIp = getIpLiteral(normalizedHostname)
  const records = literalIp
    ? [{ address: literalIp, family: net.isIP(literalIp) }]
    : await dnsPromises.lookup(normalizedHostname, { all: true, verbatim: true })

  if (!records || records.length === 0) {
    throw new Error(`${target} did not resolve to any addresses`)
  }

  const blockedRecord = records.find((record) => isBlockedIp(record.address))
  if (blockedRecord) {
    throw new Error(`${target} resolves to blocked address ${blockedRecord.address}`)
  }

  return {
    hostname: normalizedHostname,
    records,
    lookup: createPinnedLookup(normalizedHostname, records)
  }
}

async function assertSafeOutboundUrl(rawUrl, options = {}) {
  const allowedProtocols = options.allowedProtocols || ['http:', 'https:']
  const target = options.target || 'Outbound URL'
  let parsedUrl

  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    throw new Error(`${target} is invalid`)
  }

  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    throw new Error(`${target} uses unsupported protocol ${parsedUrl.protocol}`)
  }

  const validation = await resolveOutboundHost(parsedUrl.hostname, target)
  return {
    url: parsedUrl.toString(),
    parsedUrl,
    ...validation
  }
}

async function assertSafeOutboundHost(hostname, options = {}) {
  return resolveOutboundHost(hostname, options.target || 'Outbound host')
}

module.exports = {
  assertSafeOutboundHost,
  assertSafeOutboundUrl,
  isBlockedIp
}

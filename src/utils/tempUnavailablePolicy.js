const isEmptyValue = (value) => value === undefined || value === null || value === ''

const parseBooleanLike = (value) => {
  if (value === true || value === false) {
    return value
  }
  if (value === 1 || value === '1') {
    return true
  }
  if (value === 0 || value === '0') {
    return false
  }

  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

const normalizeOptionalNonNegativeInteger = (value) => {
  if (isEmptyValue(value)) {
    return null
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }
  return Math.floor(parsed)
}

const normalizeTempUnavailablePolicyInput = (value = {}) => ({
  disableTempUnavailable: parseBooleanLike(value.disableTempUnavailable),
  tempUnavailable503TtlSeconds: normalizeOptionalNonNegativeInteger(
    value.tempUnavailable503TtlSeconds
  ),
  tempUnavailable5xxTtlSeconds: normalizeOptionalNonNegativeInteger(
    value.tempUnavailable5xxTtlSeconds
  )
})

const normalizeTempUnavailablePolicyFromAccountData = (accountData = {}) => {
  const normalized = normalizeTempUnavailablePolicyInput(accountData)
  return {
    disableTempUnavailable: normalized.disableTempUnavailable,
    ttl503Seconds: normalized.tempUnavailable503TtlSeconds,
    ttl5xxSeconds: normalized.tempUnavailable5xxTtlSeconds
  }
}

module.exports = {
  isEmptyValue,
  parseBooleanLike,
  normalizeOptionalNonNegativeInteger,
  normalizeTempUnavailablePolicyInput,
  normalizeTempUnavailablePolicyFromAccountData
}

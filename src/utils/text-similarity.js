const MAX_TEXT_LENGTH = 4000

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function clamp(value) {
  if (value.length <= MAX_TEXT_LENGTH) {
    return value
  }

  // 截断极长文本，避免耗时的相似度计算
  return value.slice(0, MAX_TEXT_LENGTH)
}

function buildBigramStats(text) {
  const stats = new Map()

  for (let index = 0; index < text.length - 1; index += 1) {
    const gram = text[index] + text[index + 1]
    stats.set(gram, (stats.get(gram) || 0) + 1)
  }

  return {
    stats,
    total: Math.max(text.length - 1, 0)
  }
}

function diceCoefficient(left, right) {
  if (left === right) {
    return 1
  }

  if (left.length < 2 || right.length < 2) {
    return left === right && left.length > 0 ? 1 : 0
  }

  const { stats: leftStats, total: leftTotal } = buildBigramStats(left)
  const { stats: rightStats, total: rightTotal } = buildBigramStats(right)

  let intersection = 0
  const [smaller, larger] =
    leftStats.size <= rightStats.size ? [leftStats, rightStats] : [rightStats, leftStats]

  smaller.forEach((count, gram) => {
    if (larger.has(gram)) {
      intersection += Math.min(count, larger.get(gram))
    }
  })

  if (leftTotal + rightTotal === 0) {
    return 0
  }

  return (2 * intersection) / (leftTotal + rightTotal)
}

function simple(actual, expected, threshold = 0.9) {
  if (typeof expected !== 'string' || !expected.trim()) {
    throw new Error('期望的提示词必须是非空字符串')
  }

  if (typeof actual !== 'string' || !actual.trim()) {
    return { score: 0, threshold, passed: false }
  }

  const normalizedExpected = clamp(normalize(expected))
  const normalizedActual = clamp(normalize(actual))
  const score = diceCoefficient(normalizedActual, normalizedExpected)

  return {
    score,
    threshold,
    passed: score >= threshold
  }
}

module.exports = {
  simple
}

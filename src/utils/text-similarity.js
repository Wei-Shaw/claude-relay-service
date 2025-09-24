import stringSimilarity from 'string-similarity'

function normalize(value) {
  return value.replace(/\s+/g, ' ').trim()
}

export function simple(actual, expected, threshold) {
  if (typeof expected !== 'string' || !expected.trim()) {
    throw new Error('Expected prompt text must be a non-empty string')
  }

  if (typeof actual !== 'string' || !actual.trim()) {
    return { score: 0, threshold, passed: false }
  }

  const score = stringSimilarity.compareTwoStrings(normalize(actual), normalize(expected))
  return { score, threshold, passed: score >= threshold }
}

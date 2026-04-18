/**
 * Claude Cloaking Utils
 *
 * Sanitizes third-party CLI (opencode, etc.) system prompts to remove
 * brand markers before the original system text is relocated to a user
 * message. This prevents the Anthropic upstream from detecting third-party
 * clients via brand keyword scans on message content.
 *
 * Ported from opencode-anthropic-auth's transform.ts + constants.ts
 * (https://github.com/anomalyco/opencode-anthropic-auth — referenced by
 * PR #884). Keep these tables in sync with upstream when OpenCode's
 * prompt wording changes.
 *
 * Strategy — anchor-based surgical sanitization:
 *   1. Drop the entire paragraph containing the OpenCode identity line
 *      (detected via `OPENCODE_IDENTITY_PREFIX`).
 *   2. Drop any paragraph (text between blank lines) that contains one of
 *      the `PARAGRAPH_REMOVAL_ANCHORS` — typically URLs that identify
 *      OpenCode-specific content. Resilient to upstream rewording as
 *      long as the anchor string still appears in the paragraph.
 *   3. Apply inline `TEXT_REPLACEMENTS` for `OpenCode` mentions inside
 *      paragraphs we want to keep.
 *
 * Everything else is preserved (tone/style, task management rules, tool
 * usage policy, environment info, user/project instructions, file paths).
 */

const OPENCODE_IDENTITY_PREFIX = 'You are OpenCode'

const PARAGRAPH_REMOVAL_ANCHORS = [
  // Help/feedback block — references the OpenCode GitHub repo
  'github.com/anomalyco/opencode',
  // OpenCode docs guidance — references the OpenCode docs URL
  'opencode.ai/docs'
]

const TEXT_REPLACEMENTS = [
  { match: 'if OpenCode honestly', replacement: 'if the assistant honestly' }
]

function sanitizeSystemText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return ''
  }

  const paragraphs = text.split(/\n\n+/)

  const filtered = paragraphs.filter((paragraph) => {
    if (paragraph.includes(OPENCODE_IDENTITY_PREFIX)) {
      return false
    }
    for (const anchor of PARAGRAPH_REMOVAL_ANCHORS) {
      if (paragraph.includes(anchor)) {
        return false
      }
    }
    return true
  })

  let result = filtered.join('\n\n')

  for (const rule of TEXT_REPLACEMENTS) {
    if (rule.match) {
      result = result.split(rule.match).join(rule.replacement)
    }
  }

  return result.trim()
}

module.exports = {
  sanitizeSystemText,
  OPENCODE_IDENTITY_PREFIX,
  PARAGRAPH_REMOVAL_ANCHORS,
  TEXT_REPLACEMENTS
}

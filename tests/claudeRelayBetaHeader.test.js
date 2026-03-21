/**
 * _getBetaHeader - context-1m stripping tests
 *
 * 1M context is now GA. The context-1m beta header is no longer needed and
 * can trigger legacy extra-usage checks on some orgs. The relay strips it.
 *
 * Tests the beta header construction logic directly without loading
 * the full ClaudeRelayService (which has many transitive dependencies).
 */

describe('_getBetaHeader - context-1m stripping', () => {
  // Replicate the _getBetaHeader logic to test in isolation
  function getBetaHeader(modelId, clientBetaHeader) {
    const OAUTH_BETA = 'oauth-2025-04-20'
    const CLAUDE_CODE_BETA = 'claude-code-20250219'
    const INTERLEAVED_THINKING_BETA = 'interleaved-thinking-2025-05-14'
    const TOOL_STREAMING_BETA = 'fine-grained-tool-streaming-2025-05-14'

    const isHaikuModel = modelId && modelId.toLowerCase().includes('haiku')
    const baseBetas = isHaikuModel
      ? [OAUTH_BETA, INTERLEAVED_THINKING_BETA]
      : [CLAUDE_CODE_BETA, OAUTH_BETA, INTERLEAVED_THINKING_BETA, TOOL_STREAMING_BETA]

    const betaList = []
    const seen = new Set()
    const addBeta = (beta) => {
      if (!beta || seen.has(beta)) return
      seen.add(beta)
      betaList.push(beta)
    }

    baseBetas.forEach(addBeta)

    if (clientBetaHeader) {
      clientBetaHeader
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        // Strip context-1m beta: 1M context is now GA (no header needed).
        // Keeping it triggers legacy extra-usage checks on some orgs.
        .filter((p) => !p.startsWith('context-1m'))
        .forEach(addBeta)
    }

    return betaList.join(',')
  }

  it('should strip context-1m from client beta header', () => {
    const clientBeta =
      'claude-code-20250219,context-1m-2025-08-07,interleaved-thinking-2025-05-14,redact-thinking-2026-02-12'
    const result = getBetaHeader('claude-sonnet-4-6', clientBeta)
    expect(result).not.toContain('context-1m')
    expect(result).toContain('interleaved-thinking-2025-05-14')
    expect(result).toContain('redact-thinking-2026-02-12')
  })

  it('should strip context-1m regardless of version suffix', () => {
    const clientBeta = 'context-1m-2026-01-01,interleaved-thinking-2025-05-14'
    const result = getBetaHeader('claude-opus-4-6', clientBeta)
    expect(result).not.toContain('context-1m')
    expect(result).toContain('interleaved-thinking-2025-05-14')
  })

  it('should preserve all other beta flags from client', () => {
    const clientBeta =
      'interleaved-thinking-2025-05-14,redact-thinking-2026-02-12,prompt-caching-scope-2026-01-05,effort-2025-11-24'
    const result = getBetaHeader('claude-sonnet-4-6', clientBeta)
    expect(result).toContain('redact-thinking-2026-02-12')
    expect(result).toContain('prompt-caching-scope-2026-01-05')
    expect(result).toContain('effort-2025-11-24')
  })

  it('should work when client sends no beta header', () => {
    const result = getBetaHeader('claude-sonnet-4-6', '')
    expect(result).not.toContain('context-1m')
    expect(result).toContain('claude-code-20250219')
  })

  it('should work when client sends only context-1m', () => {
    const result = getBetaHeader('claude-sonnet-4-6', 'context-1m-2025-08-07')
    expect(result).not.toContain('context-1m')
    // Should still have base betas
    expect(result).toContain('claude-code-20250219')
    expect(result).toContain('oauth-2025-04-20')
  })

  it('should include base betas for non-haiku models', () => {
    const result = getBetaHeader('claude-opus-4-6', '')
    expect(result).toContain('claude-code-20250219')
    expect(result).toContain('oauth-2025-04-20')
    expect(result).toContain('interleaved-thinking-2025-05-14')
    expect(result).toContain('fine-grained-tool-streaming-2025-05-14')
  })

  it('should use haiku-specific betas for haiku models', () => {
    const result = getBetaHeader('claude-haiku-4-5-20251001', '')
    expect(result).not.toContain('claude-code-20250219')
    expect(result).toContain('oauth-2025-04-20')
    expect(result).toContain('interleaved-thinking-2025-05-14')
  })
})

/* eslint-env jest */
const codexModelsCatalogService = require('../src/services/codexModelsCatalogService')
const { validateCatalog } = require('../src/services/codexModelsCatalogService')

function createCatalog(slugs = ['gpt-test']) {
  return {
    models: slugs.map((slug, priority) => ({
      slug,
      display_name: slug,
      description: null,
      supported_reasoning_levels: [],
      shell_type: 'shell',
      visibility: 'list',
      supported_in_api: true,
      priority,
      truncation_policy: { mode: 'tokens', limit: 1000 },
      experimental_supported_tools: [],
      future_field: { preserved: true }
    }))
  }
}

describe('Codex models catalog service', () => {
  beforeEach(() => codexModelsCatalogService.resetForTests())

  test('rejects standard OpenAI and empty model-list payloads', () => {
    expect(() => validateCatalog({ object: 'list', data: [] })).toThrow('non-empty models array')
    expect(() => validateCatalog({ models: [] })).toThrow('non-empty models array')
  })

  test('atomically retains the last validated catalog when refresh fails', async () => {
    const first = createCatalog(['gpt-old'])
    await codexModelsCatalogService.getOrRefresh('0.155.1', async () => ({ payload: first }))
    codexModelsCatalogService.getEntry('0.155.1').updatedAt = 0

    const result = await codexModelsCatalogService.getOrRefresh('0.155.1', async () => {
      throw new Error('upstream unavailable')
    })

    expect(result.source).toBe('stale-cache')
    expect(result.payload.models.map((model) => model.slug)).toEqual(['gpt-old'])
    expect(result.refreshError.message).toBe('upstream unavailable')
  })

  test('does not replace a validated catalog with malformed upstream data', async () => {
    await codexModelsCatalogService.getOrRefresh('0.155.1', async () => ({
      payload: createCatalog(['gpt-old'])
    }))
    codexModelsCatalogService.getEntry('0.155.1').updatedAt = 0

    const result = await codexModelsCatalogService.getOrRefresh('0.155.1', async () => ({
      payload: { models: [{ slug: 'gpt-broken' }] }
    }))

    expect(result.source).toBe('stale-cache')
    expect(result.payload.models[0].slug).toBe('gpt-old')
  })

  test('reuses a validated catalog after an upstream 304 response', async () => {
    await codexModelsCatalogService.getOrRefresh('0.155.1', async () => ({
      payload: createCatalog(['gpt-current']),
      etag: '"upstream-etag"'
    }))
    codexModelsCatalogService.getEntry('0.155.1').updatedAt = 0

    const loader = jest.fn(async (etag) => ({ notModified: true, etag }))
    const result = await codexModelsCatalogService.getOrRefresh('0.155.1', loader)

    expect(loader).toHaveBeenCalledWith('"upstream-etag"')
    expect(result.source).toBe('revalidated-cache')
    expect(result.payload.models[0].slug).toBe('gpt-current')
  })

  test('coalesces concurrent refreshes for the same client version', async () => {
    let resolveLoader
    const loader = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveLoader = resolve
        })
    )

    const first = codexModelsCatalogService.getOrRefresh('0.155.1', loader)
    const second = codexModelsCatalogService.getOrRefresh('0.155.1', loader)
    resolveLoader({ payload: createCatalog(['gpt-shared']) })

    const [firstResult, secondResult] = await Promise.all([first, second])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(firstResult.payload).toBe(secondResult.payload)
  })

  test('preserves unknown metadata and filters restricted slugs per API key', async () => {
    const catalog = createCatalog(['gpt-visible', 'gpt-blocked'])
    const result = await codexModelsCatalogService.getOrRefresh('0.155.1', async () => ({
      payload: catalog
    }))
    const filtered = codexModelsCatalogService.filterForApiKey(result.payload, {
      enableModelRestriction: true,
      restrictedModels: ['gpt-blocked']
    })

    expect(filtered.models.map((model) => model.slug)).toEqual(['gpt-visible'])
    expect(filtered.models[0].future_field).toEqual({ preserved: true })
    expect(codexModelsCatalogService.createClientEtag(filtered)).toMatch(/^"crs-[^"]+"$/)
  })

  test.each(['0.155.1', '1.2.3-beta.1', '1.2.3+build'])('accepts client version %s', (version) => {
    expect(codexModelsCatalogService.normalizeClientVersion(version)).toBe(version)
  })

  test.each(['', '155', '0.155', '../secret', '1.2.3?x=1'])(
    'rejects invalid client version %s',
    (version) => {
      expect(codexModelsCatalogService.normalizeClientVersion(version)).toBeNull()
    }
  )
})

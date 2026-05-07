const requestBodyRuleService = require('../src/services/requestBodyRuleService')

describe('requestBodyRuleService', () => {
  test('applies multiple rules with nested paths and typed values', () => {
    const body = {
      model: 'gpt-4.1',
      input: [{ role: 'user' }],
      metadata: {}
    }

    const result = requestBodyRuleService.applyRules(body, [
      { path: 'model', valueType: 'string', value: 'gpt-5' },
      { path: 'input.0.priority', valueType: 'number', value: '2' },
      { path: 'metadata.debug', valueType: 'boolean', value: 'true' },
      { path: 'text.format', valueType: 'json', value: '{"type":"json_schema"}' }
    ])

    expect(result).toEqual({
      model: 'gpt-5',
      input: [{ role: 'user', priority: 2 }],
      metadata: { debug: true },
      text: {
        format: {
          type: 'json_schema'
        }
      }
    })
    expect(body).toEqual({
      model: 'gpt-4.1',
      input: [{ role: 'user' }],
      metadata: {}
    })
  })

  test('uses empty string when value is omitted for any value type', () => {
    const result = requestBodyRuleService.applyRules({}, [
      { path: 'a', valueType: 'string', value: '' },
      { path: 'b', valueType: 'number', value: '' },
      { path: 'c', valueType: 'boolean', value: '' },
      { path: 'd', valueType: 'json', value: '' }
    ])

    expect(result).toEqual({
      a: '',
      b: '',
      c: '',
      d: ''
    })
  })

  test('keeps the last rule when the same path appears multiple times', () => {
    const result = requestBodyRuleService.applyRules({ model: 'gpt-4.1' }, [
      { path: 'model', valueType: 'string', value: 'gpt-5' },
      { path: 'model', valueType: 'string', value: 'gpt-5-codex' }
    ])

    expect(result.model).toBe('gpt-5-codex')
  })

  test('rejects invalid typed values', () => {
    expect(
      requestBodyRuleService.validateAndNormalizeRules([
        { path: 'count', valueType: 'number', value: 'abc' }
      ])
    ).toEqual({
      valid: false,
      error: 'Payload rule #1: Rule path "count" expects a valid number'
    })

    expect(
      requestBodyRuleService.validateAndNormalizeRules([
        { path: 'flag', valueType: 'boolean', value: 'yes' }
      ])
    ).toEqual({
      valid: false,
      error: 'Payload rule #1: Rule path "flag" expects "true" or "false"'
    })

    expect(
      requestBodyRuleService.validateAndNormalizeRules([
        { path: 'payload', valueType: 'json', value: '{broken}' }
      ])
    ).toEqual({
      valid: false,
      error: 'Payload rule #1: Rule path "payload" expects valid JSON'
    })
  })
})

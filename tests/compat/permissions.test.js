const { normalizePermissions, hasPermission } = require('../../src/compat/permissions')

describe('compat/permissions normalizePermissions', () => {
  test('空值 → 空数组(全部服务)', () => {
    expect(normalizePermissions(null)).toEqual([])
    expect(normalizePermissions(undefined)).toEqual([])
    expect(normalizePermissions('')).toEqual([])
  })

  test('数组原样返回', () => {
    expect(normalizePermissions(['claude'])).toEqual(['claude'])
  })

  test("'all' → 空数组", () => {
    expect(normalizePermissions('all')).toEqual([])
  })

  test('JSON 数组字符串 → 数组', () => {
    expect(normalizePermissions('["claude","openai"]')).toEqual(['claude', 'openai'])
  })

  test('[ 开头但 JSON 解析失败 → 当作裸字符串', () => {
    expect(normalizePermissions('[bad')).toEqual(['[bad'])
  })

  test('逗号分隔 → 去空白后数组', () => {
    expect(normalizePermissions('claude, openai ')).toEqual(['claude', 'openai'])
  })

  test('裸字符串 → 单元素数组', () => {
    expect(normalizePermissions('claude')).toEqual(['claude'])
  })

  test('非字符串非数组(对象) → 空数组', () => {
    expect(normalizePermissions({})).toEqual([])
  })
})

describe('compat/permissions hasPermission', () => {
  test('空权限 = 全部服务', () => {
    expect(hasPermission(null, 'claude')).toBe(true)
    expect(hasPermission([], 'openai')).toBe(true)
    expect(hasPermission('all', 'gemini')).toBe(true)
  })

  test('命中服务', () => {
    expect(hasPermission(['claude', 'openai'], 'openai')).toBe(true)
  })

  test('未命中服务', () => {
    expect(hasPermission(['claude'], 'openai')).toBe(false)
  })
})

/**
 * Server-Sent Events (SSE) 解析工具
 *
 * 用于解析标准 SSE 格式的数据流
 * 当前主要用于 Gemini API 的流式响应处理
 *
 * @module sseParser
 */

/**
 * 解析单行 SSE 数据
 *
 * @param {string} line - SSE 格式的行（如："data: {json}\n"）
 * @returns {Object} 解析结果
 * @returns {'data'|'control'|'other'|'invalid'} .type - 行类型
 * @returns {Object|null} .data - 解析后的 JSON 数据（仅 type='data' 时）
 * @returns {string} .line - 原始行内容
 * @returns {string} [.jsonStr] - JSON 字符串
 * @returns {Error} [.error] - 解析错误（仅 type='invalid' 时）
 *
 * @example
 * // 数据行
 * parseSSELine('data: {"key":"value"}')
 * // => { type: 'data', data: {key: 'value'}, line: '...', jsonStr: '...' }
 *
 * @example
 * // 控制行
 * parseSSELine('data: [DONE]')
 * // => { type: 'control', data: null, line: '...', jsonStr: '[DONE]' }
 */
function parseSSELine(line) {
  if (!line.startsWith('data: ')) {
    return { type: 'other', line, data: null }
  }

  const jsonStr = line.substring(6).trim()

  if (!jsonStr || jsonStr === '[DONE]') {
    return { type: 'control', line, data: null, jsonStr }
  }

  try {
    const data = JSON.parse(jsonStr)
    return { type: 'data', line, data, jsonStr }
  } catch (e) {
    return { type: 'invalid', line, data: null, jsonStr, error: e }
  }
}

module.exports = {
  parseSSELine
}

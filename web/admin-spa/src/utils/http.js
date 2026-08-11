// 基于原生 fetch 的请求内核，替代 axios
// 配置: { url, method, params, data, headers, timeout, responseType, signal }
// onRequest(config, init): 在发送前注入 token 等；可修改 init.headers
// onResponse(res, parsed, config): 统一处理响应，res 为 null 表示网络异常/超时/取消

const defaultSerializeParams = (params) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && item !== undefined) search.append(key, item)
      }
    } else {
      search.append(key, value)
    }
  }
  return search.toString()
}

export const createHttp =
  ({
    baseURL,
    timeout = 30000,
    serializeParams = defaultSerializeParams,
    onRequest,
    onResponse
  } = {}) =>
  async (config) => {
    const {
      url,
      method = 'GET',
      params,
      data,
      headers = {},
      timeout: reqTimeout,
      responseType,
      signal
    } = config
    const base = typeof baseURL === 'function' ? baseURL() : baseURL || ''

    // 拼接 URL + 查询参数
    let fullUrl = base + url
    if (params) {
      const qs = serializeParams(params)
      if (qs) fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs
    }

    // 超时控制 + 外部取消; timeout 为 0 表示不限时（流式场景）
    const controller = new AbortController()
    const ms = reqTimeout !== undefined ? reqTimeout : timeout
    let timedOut = false
    let timer

    try {
      // 请求体: FormData / 字符串 / JSON
      // 整段放入 try: JSON.stringify 遇循环引用等异常时走统一兜底，不破坏“不 reject”契约
      const init = { method, headers: { ...headers } }
      if (data !== undefined && data !== null && method !== 'GET') {
        if (data instanceof FormData) {
          init.body = data
        } else if (typeof data === 'string') {
          init.body = data
          if (!init.headers['Content-Type']) {
            init.headers['Content-Type'] = 'application/x-www-form-urlencoded'
          }
        } else {
          init.body = JSON.stringify(data)
          if (!init.headers['Content-Type']) init.headers['Content-Type'] = 'application/json'
        }
      }

      if (onRequest) onRequest(config, init)

      if (ms > 0) timer = setTimeout(() => ((timedOut = true), controller.abort()), ms)
      if (signal) {
        // 传入已取消的 signal 时立即中断（与 axios 行为一致）
        if (signal.aborted) controller.abort()
        else signal.addEventListener('abort', () => controller.abort(), { once: true })
      }
      init.signal = controller.signal

      const res = await fetch(fullUrl, init)
      if (timer) clearTimeout(timer)

      // 原始 Response（流式/SSE 场景），不解析直接返回
      if (responseType === 'response') return res

      // 二进制响应: 非 2xx 仍交给 onResponse 处理错误
      if (responseType === 'blob' || responseType === 'arraybuffer') {
        if (!res.ok && onResponse) {
          return onResponse(res, { status: res.status, message: res.statusText }, config)
        }
        return responseType === 'blob' ? res.blob() : res.arrayBuffer()
      }

      const text = await res.text()
      let json
      try {
        // 非 JSON 响应（如后端 HTML 错误页）保留原始字符串，等价于 axios 的 response.data
        // 字符串无 success/error/message 字段，onResponse 会自然 fall through 到状态码兜底
        json = text ? JSON.parse(text) : {}
      } catch {
        json = text
      }

      if (onResponse) return onResponse(res, json, config)
      return json
    } catch (e) {
      if (timer) clearTimeout(timer)
      if (responseType === 'response') throw e
      // 区分超时 / 外部主动取消 / 其它失败; 主动取消标记 aborted 供上层跳过错误日志
      const aborted = !timedOut && e.name === 'AbortError'
      const status = timedOut ? 408 : 0
      const message = timedOut ? '请求超时' : aborted ? '请求已取消' : '请求失败'
      const result = { status, message, aborted, error: e }
      if (onResponse) return onResponse(null, result, config)
      return result
    }
  }

/**
 * Web 工具禁用策略单元测试
 * 测试 applyWebToolDisablePolicy 及其辅助函数
 */

// 在加载模块前设置环境变量
process.env.DISABLE_WEB_TOOLS = 'true'

// Mock logger 以避免依赖真实日志系统
jest.mock('../src/utils/logger', () => ({
  api: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn()
}))

// Mock 其他 api.js 依赖（只需要策略函数，不需要完整路由初始化）
jest.mock('../src/services/relay/claudeRelayService', () => ({}))
jest.mock('../src/services/relay/claudeConsoleRelayService', () => ({}))
jest.mock('../src/services/relay/bedrockRelayService', () => ({}))
jest.mock('../src/services/relay/ccrRelayService', () => ({}))
jest.mock('../src/services/account/bedrockAccountService', () => ({}))
jest.mock('../src/services/scheduler/unifiedClaudeScheduler', () => ({}))
jest.mock('../src/services/apiKeyService', () => ({ hasPermission: jest.fn() }))
jest.mock('../src/middleware/auth', () => ({ authenticateApiKey: jest.fn() }))
jest.mock('../src/utils/modelHelper', () => ({
  getEffectiveModel: jest.fn(),
  parseVendorPrefixedModel: jest.fn()
}))
jest.mock('../src/utils/sessionHelper', () => ({}))
jest.mock('../src/utils/rateLimitHelper', () => ({ updateRateLimitCounters: jest.fn() }))
jest.mock('../src/services/claudeRelayConfigService', () => ({}))
jest.mock('../src/services/account/claudeAccountService', () => ({}))
jest.mock('../src/services/account/claudeConsoleAccountService', () => ({}))
jest.mock('../src/utils/warmupInterceptor', () => ({
  isWarmupRequest: jest.fn(),
  buildMockWarmupResponse: jest.fn(),
  sendMockWarmupStream: jest.fn()
}))
jest.mock('../src/utils/errorSanitizer', () => ({ sanitizeUpstreamError: jest.fn() }))
jest.mock('../src/utils/anthropicRequestDump', () => ({
  dumpAnthropicMessagesRequest: jest.fn()
}))
jest.mock('../src/services/anthropicGeminiBridgeService', () => ({
  handleAnthropicMessagesToGemini: jest.fn(),
  handleAnthropicCountTokensToGemini: jest.fn()
}))

const {
  isDisabledWebTool,
  isDisabledWebToolChoice,
  ensureWebToolDisabledNotice,
  applyWebToolDisablePolicy
} = require('../src/routes/api')._webToolPolicy

describe('isDisabledWebTool', () => {
  test('识别 web_search server tool（type 带日期后缀）', () => {
    expect(isDisabledWebTool({ type: 'web_search_20250305', name: 'web_search' })).toBe(true)
  })

  test('识别 web_fetch server tool（type 带日期后缀）', () => {
    expect(isDisabledWebTool({ type: 'web_fetch_20250305', name: 'web_fetch' })).toBe(true)
  })

  test('识别未来版本号变化的 web_search', () => {
    expect(isDisabledWebTool({ type: 'web_search_20260101', name: 'web_search' })).toBe(true)
  })

  test('识别未来版本号变化的 web_fetch', () => {
    expect(isDisabledWebTool({ type: 'web_fetch_20260601', name: 'web_fetch' })).toBe(true)
  })

  test('不误伤自定义工具（type=custom）', () => {
    expect(
      isDisabledWebTool({
        type: 'custom',
        name: 'web_search',
        input_schema: { type: 'object', properties: {} }
      })
    ).toBe(false)
  })

  test('不误伤普通自定义工具', () => {
    expect(
      isDisabledWebTool({
        type: 'custom',
        name: 'my_tool',
        input_schema: { type: 'object', properties: {} }
      })
    ).toBe(false)
  })

  test('识别只有 name 没有 type 的 web_search', () => {
    expect(isDisabledWebTool({ name: 'web_search' })).toBe(true)
  })

  test('识别 function.name 格式的 web_search', () => {
    expect(isDisabledWebTool({ type: 'function', function: { name: 'web_search' } })).toBe(true)
  })

  test('忽略 null/undefined', () => {
    expect(isDisabledWebTool(null)).toBe(false)
    expect(isDisabledWebTool(undefined)).toBe(false)
  })

  test('不误伤 text_editor 等其他 server tool', () => {
    expect(isDisabledWebTool({ type: 'text_editor_20250124', name: 'str_replace_editor' })).toBe(
      false
    )
  })

  test('不误伤 computer 工具', () => {
    expect(isDisabledWebTool({ type: 'computer_20250124', name: 'computer' })).toBe(false)
  })

  test('不误伤 bash 工具', () => {
    expect(isDisabledWebTool({ type: 'bash_20250124', name: 'bash' })).toBe(false)
  })
})

describe('isDisabledWebToolChoice', () => {
  test('识别指向 web_search 的 tool_choice', () => {
    expect(isDisabledWebToolChoice({ type: 'tool', name: 'web_search' })).toBe(true)
  })

  test('识别指向 web_fetch 的 tool_choice', () => {
    expect(isDisabledWebToolChoice({ type: 'tool', name: 'web_fetch' })).toBe(true)
  })

  test('不拦截 auto 类型', () => {
    expect(isDisabledWebToolChoice({ type: 'auto' })).toBe(false)
  })

  test('不拦截 any 类型', () => {
    expect(isDisabledWebToolChoice({ type: 'any' })).toBe(false)
  })

  test('不拦截指向其他工具的 tool_choice', () => {
    expect(isDisabledWebToolChoice({ type: 'tool', name: 'bash' })).toBe(false)
  })

  test('处理 null/undefined', () => {
    expect(isDisabledWebToolChoice(null)).toBe(false)
    expect(isDisabledWebToolChoice(undefined)).toBe(false)
  })
})

describe('ensureWebToolDisabledNotice', () => {
  test('向字符串格式 system 追加通知', () => {
    const body = { system: 'You are a helpful assistant.' }
    ensureWebToolDisabledNotice(body)
    expect(body.system).toContain('You are a helpful assistant.')
    expect(body.system).toContain('Web search and web fetch tools are disabled')
  })

  test('向数组格式 system 追加通知', () => {
    const body = {
      system: [{ type: 'text', text: 'You are a helpful assistant.' }]
    }
    ensureWebToolDisabledNotice(body)
    expect(body.system).toHaveLength(2)
    expect(body.system[1].type).toBe('text')
    expect(body.system[1].text).toContain('Web search and web fetch tools are disabled')
  })

  test('不重复注入（字符串格式）', () => {
    const body = { system: 'You are a helpful assistant.' }
    ensureWebToolDisabledNotice(body)
    const afterFirst = body.system
    ensureWebToolDisabledNotice(body)
    expect(body.system).toBe(afterFirst) // 内容不变
  })

  test('不重复注入（数组格式）', () => {
    const body = {
      system: [{ type: 'text', text: 'You are a helpful assistant.' }]
    }
    ensureWebToolDisabledNotice(body)
    ensureWebToolDisabledNotice(body)
    expect(body.system).toHaveLength(2) // 不会变成3
  })

  test('system 不存在时创建', () => {
    const body = {}
    ensureWebToolDisabledNotice(body)
    expect(body.system).toContain('Web search and web fetch tools are disabled')
  })
})

describe('applyWebToolDisablePolicy', () => {
  test('移除 web_search 和 web_fetch，保留其他工具', () => {
    const body = {
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [
        { type: 'web_search_20250305', name: 'web_search' },
        { type: 'web_fetch_20250305', name: 'web_fetch' },
        {
          type: 'custom',
          name: 'bash',
          input_schema: { type: 'object', properties: { command: { type: 'string' } } }
        },
        {
          type: 'text_editor_20250124',
          name: 'str_replace_editor'
        }
      ]
    }

    const removed = applyWebToolDisablePolicy(body)

    expect(removed).toBe(true)
    expect(body.tools).toHaveLength(2)
    expect(body.tools[0].name).toBe('bash')
    expect(body.tools[1].name).toBe('str_replace_editor')
    // 应该注入了通知
    expect(typeof body.system).toBe('string')
    expect(body.system).toContain('Web search and web fetch tools are disabled')
  })

  test('只有 web 工具时删除整个 tools 字段', () => {
    const body = {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }]
    }

    applyWebToolDisablePolicy(body)

    expect(body.tools).toBeUndefined()
  })

  test('没有 web 工具时不做任何修改', () => {
    const body = {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [
        {
          type: 'custom',
          name: 'bash',
          input_schema: { type: 'object', properties: {} }
        }
      ],
      system: 'You are helpful.'
    }

    const removed = applyWebToolDisablePolicy(body)

    expect(removed).toBe(false)
    expect(body.tools).toHaveLength(1)
    expect(body.system).toBe('You are helpful.') // 不变
  })

  test('移除指向 web_search 的 tool_choice', () => {
    const body = {
      messages: [{ role: 'user', content: 'search something' }],
      tools: [
        { type: 'web_search_20250305', name: 'web_search' },
        { type: 'custom', name: 'bash', input_schema: { type: 'object', properties: {} } }
      ],
      tool_choice: { type: 'tool', name: 'web_search' }
    }

    applyWebToolDisablePolicy(body)

    expect(body.tool_choice).toBeUndefined()
    expect(body.tools).toHaveLength(1)
    expect(body.tools[0].name).toBe('bash')
  })

  test('不修改 tool_choice: auto', () => {
    const body = {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [
        { type: 'web_search_20250305', name: 'web_search' },
        { type: 'custom', name: 'bash', input_schema: { type: 'object', properties: {} } }
      ],
      tool_choice: { type: 'auto' }
    }

    applyWebToolDisablePolicy(body)

    expect(body.tool_choice).toEqual({ type: 'auto' })
  })

  test('没有 tools 字段的请求不受影响', () => {
    const body = {
      messages: [{ role: 'user', content: 'hello' }],
      model: 'claude-sonnet-4-20250514'
    }

    const removed = applyWebToolDisablePolicy(body)

    expect(removed).toBe(false)
    expect(body.tools).toBeUndefined()
  })

  test('system 为数组时正确注入', () => {
    const body = {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: [
        {
          type: 'text',
          text: "You are Claude Code, Anthropic's official CLI for Claude.",
          cache_control: { type: 'ephemeral' }
        }
      ]
    }

    applyWebToolDisablePolicy(body)

    expect(body.system).toHaveLength(2)
    expect(body.system[0].text).toContain('Claude Code')
    expect(body.system[1].text).toContain('Web search and web fetch tools are disabled')
  })

  test('混合 web_search 和自定义同名工具 - 只移除 server tool', () => {
    const body = {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [
        { type: 'web_search_20250305', name: 'web_search' }, // server tool -> 移除
        {
          type: 'custom',
          name: 'web_search',
          input_schema: { type: 'object', properties: {} }
        } // 自定义 -> 保留
      ]
    }

    applyWebToolDisablePolicy(body)

    expect(body.tools).toHaveLength(1)
    expect(body.tools[0].type).toBe('custom')
  })
})

describe('applyWebToolDisablePolicy - 环境变量关闭时', () => {
  test('DISABLE_WEB_TOOLS 为 true 时策略生效', () => {
    // 环境变量已在文件顶部设为 true
    const body = {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }]
    }

    const removed = applyWebToolDisablePolicy(body)
    expect(removed).toBe(true)
  })
})

const express = require('express')
const axios = require('axios')
const router = express.Router()
const logger = require('../utils/logger')
const { authenticateApiKey } = require('../middleware/auth')
const claudeAccountService = require('../services/claudeAccountService')
const unifiedOpenAIScheduler = require('../services/unifiedOpenAIScheduler')
const openaiAccountService = require('../services/openaiAccountService')
const apiKeyService = require('../services/apiKeyService')
const crypto = require('crypto')
const ProxyHelper = require('../utils/proxyHelper')

// 创建代理 Agent（使用统一的代理工具）
function createProxyAgent(proxy) {
  return ProxyHelper.createProxyAgent(proxy)
}

// 使用统一调度器选择 OpenAI 账户
async function getOpenAIAuthToken(apiKeyData, sessionId = null, requestedModel = null) {
  try {
    // 生成会话哈希（如果有会话ID）
    const sessionHash = sessionId
      ? crypto.createHash('sha256').update(sessionId).digest('hex')
      : null

    // 使用统一调度器选择账户
    const result = await unifiedOpenAIScheduler.selectAccountForApiKey(
      apiKeyData,
      sessionHash,
      requestedModel
    )

    if (!result || !result.accountId) {
      throw new Error('No available OpenAI account found')
    }

    // 获取账户详情
    const account = await openaiAccountService.getAccount(result.accountId)
    if (!account || !account.accessToken) {
      throw new Error(`OpenAI account ${result.accountId} has no valid accessToken`)
    }

    // 解密 accessToken
    const accessToken = claudeAccountService._decryptSensitiveData(account.accessToken)
    if (!accessToken) {
      throw new Error('Failed to decrypt OpenAI accessToken')
    }

    // 解析代理配置
    let proxy = null
    if (account.proxy) {
      try {
        proxy = typeof account.proxy === 'string' ? JSON.parse(account.proxy) : account.proxy
      } catch (e) {
        logger.warn('Failed to parse proxy configuration:', e)
      }
    }

    logger.info(`Selected OpenAI account: ${account.name} (${result.accountId})`)
    return {
      accessToken,
      accountId: result.accountId,
      accountName: account.name,
      proxy,
      account
    }
  } catch (error) {
    logger.error('Failed to get OpenAI auth token:', error)
    throw error
  }
}

router.post('/responses', authenticateApiKey, async (req, res) => {
  let upstream = null
  try {
    // 从中间件获取 API Key 数据
    const apiKeyData = req.apiKey || {}

    // 从请求头或请求体中提取会话 ID
    const sessionId =
      req.headers['session_id'] ||
      req.headers['x-session-id'] ||
      req.body?.session_id ||
      req.body?.conversation_id ||
      null

    // 从请求体中提取模型和流式标志
    let requestedModel = req.body?.model || null

    // 如果模型是 gpt-5 开头且后面还有内容（如 gpt-5-2025-08-07），则覆盖为 gpt-5
    if (requestedModel && requestedModel.startsWith('gpt-5-') && requestedModel !== 'gpt-5') {
      logger.info(`📝 Model ${requestedModel} detected, normalizing to gpt-5 for Codex API`)
      requestedModel = 'gpt-5'
      req.body.model = 'gpt-5' // 同时更新请求体中的模型
    }

    const isStream = req.body?.stream !== false // 默认为流式（兼容现有行为）

    // 判断是否为 Codex CLI 的请求
    const isCodexCLI = req.body?.instructions?.startsWith(
      'You are a coding agent running in the Codex CLI'
    )

    // 如果不是 Codex CLI 请求，则进行适配
    if (!isCodexCLI) {
      // 移除不需要的请求体字段
      const fieldsToRemove = [
        'temperature',
        'top_p',
        'max_output_tokens',
        'user',
        'text_formatting',
        'truncation',
        'text',
        'service_tier'
      ]
      fieldsToRemove.forEach((field) => {
        delete req.body[field]
      })

      // 设置固定的 Codex CLI instructions
      req.body.instructions =
        'You are a coding agent running in the Codex CLI, a terminal-based coding assistant. Codex CLI is an open source project led by OpenAI. You are expected to be precise, safe, and helpful.\n\nYour capabilities:\n- Receive user prompts and other context provided by the harness, such as files in the workspace.\n- Communicate with the user by streaming thinking & responses, and by making & updating plans.\n- Emit function calls to run terminal commands and apply patches. Depending on how this specific run is configured, you can request that these function calls be escalated to the user for approval before running. More on this in the "Sandbox and approvals" section.\n\nWithin this context, Codex refers to the open-source agentic coding interface (not the old Codex language model built by OpenAI).\n\n# How you work\n\n## Personality\n\nYour default personality and tone is concise, direct, and friendly. You communicate efficiently, always keeping the user clearly informed about ongoing actions without unnecessary detail. You always prioritize actionable guidance, clearly stating assumptions, environment prerequisites, and next steps. Unless explicitly asked, you avoid excessively verbose explanations about your work.\n\n## Responsiveness\n\n### Preamble messages\n\nBefore making tool calls, send a brief preamble to the user explaining what you’re about to do. When sending preamble messages, follow these principles and examples:\n\n- **Logically group related actions**: if you’re about to run several related commands, describe them together in one preamble rather than sending a separate note for each.\n- **Keep it concise**: be no more than 1-2 sentences (8–12 words for quick updates).\n- **Build on prior context**: if this is not your first tool call, use the preamble message to connect the dots with what’s been done so far and create a sense of momentum and clarity for the user to understand your next actions.\n- **Keep your tone light, friendly and curious**: add small touches of personality in preambles feel collaborative and engaging.\n\n**Examples:**\n- “I’ve explored the repo; now checking the API route definitions.”\n- “Next, I’ll patch the config and update the related tests.”\n- “I’m about to scaffold the CLI commands and helper functions.”\n- “Ok cool, so I’ve wrapped my head around the repo. Now digging into the API routes.”\n- “Config’s looking tidy. Next up is patching helpers to keep things in sync.”\n- “Finished poking at the DB gateway. I will now chase down error handling.”\n- “Alright, build pipeline order is interesting. Checking how it reports failures.”\n- “Spotted a clever caching util; now hunting where it gets used.”\n\n**Avoiding a preamble for every trivial read (e.g., `cat` a single file) unless it’s part of a larger grouped action.\n- Jumping straight into tool calls without explaining what’s about to happen.\n- Writing overly long or speculative preambles — focus on immediate, tangible next steps.\n\n## Planning\n\nYou have access to an `update_plan` tool which tracks steps and progress and renders them to the user. Using the tool helps demonstrate that you\'ve understood the task and convey how you\'re approaching it. Plans can help to make complex, ambiguous, or multi-phase work clearer and more collaborative for the user. A good plan should break the task into meaningful, logically ordered steps that are easy to verify as you go. Note that plans are not for padding out simple work with filler steps or stating the obvious. Do not repeat the full contents of the plan after an `update_plan` call — the harness already displays it. Instead, summarize the change made and highlight any important context or next step.\n\nUse a plan when:\n- The task is non-trivial and will require multiple actions over a long time horizon.\n- There are logical phases or dependencies where sequencing matters.\n- The work has ambiguity that benefits from outlining high-level goals.\n- You want intermediate checkpoints for feedback and validation.\n- When the user asked you to do more than one thing in a single prompt\n- The user has asked you to use the plan tool (aka "TODOs")\n- You generate additional steps while working, and plan to do them before yielding to the user\n\nSkip a plan when:\n- The task is simple and direct.\n- Breaking it down would only produce literal or trivial steps.\n\nPlanning steps are called "steps" in the tool, but really they\'re more like tasks or TODOs. As such they should be very concise descriptions of non-obvious work that an engineer might do like "Write the API spec", then "Update the backend", then "Implement the frontend". On the other hand, it\'s obvious that you\'ll usually have to "Explore the codebase" or "Implement the changes", so those are not worth tracking in your plan.\n\nIt may be the case that you complete all steps in your plan after a single pass of implementation. If this is the case, you can simply mark all the planned steps as completed. The content of your plan should not involve doing anything that you aren\'t capable of doing (i.e. don\'t try to test things that you can\'t test). Do not use plans for simple or single-step queries that you can just do or answer immediately.\n\n### Examples\n\n**High-quality plans**\n\nExample 1:\n\n1. Add CLI entry with file args\n2. Parse Markdown via CommonMark library\n3. Apply semantic HTML template\n4. Handle code blocks, images, links\n5. Add error handling for invalid files\n\nExample 2:\n\n1. Define CSS variables for colors\n2. Add toggle with localStorage state\n3. Refactor components to use variables\n4. Verify all views for readability\n5. Add smooth theme-change transition\n\nExample 3:\n\n1. Set up Node.js + WebSocket server\n2. Add join/leave broadcast events\n3. Implement messaging with timestamps\n4. Add usernames + mention highlighting\n5. Persist messages in lightweight DB\n6. Add typing indicators + unread count\n\n**Low-quality plans**\n\nExample 1:\n\n1. Create CLI tool\n2. Add Markdown parser\n3. Convert to HTML\n\nExample 2:\n\n1. Add dark mode toggle\n2. Save preference\n3. Make styles look good\n\nExample 3:\n\n1. Create single-file HTML game\n2. Run quick sanity check\n3. Summarize usage instructions\n\nIf you need to write a plan, only write high quality plans, not low quality ones.\n\n## Task execution\n\nYou are a coding agent. Please keep going until the query is completely resolved, before ending your turn and yielding back to the user. Only terminate your turn when you are sure that the problem is solved. Autonomously resolve the query to the best of your ability, using the tools available to you, before coming back to the user. Do NOT guess or make up an answer.\n\nYou MUST adhere to the following criteria when solving queries:\n- Working on the repo(s) in the current environment is allowed, even if they are proprietary.\n- Analyzing code for vulnerabilities is allowed.\n- Showing user code and tool call details is allowed.\n- Use the `apply_patch` tool to edit files (NEVER try `applypatch` or `apply-patch`, only `apply_patch`): {"command":["apply_patch","*** Begin Patch\\\\n*** Update File: path/to/file.py\\\\n@@ def example():\\\\n-  pass\\\\n+  return 123\\\\n*** End Patch"]}\n\nIf completing the user\'s task requires writing or modifying files, your code and final answer should follow these coding guidelines, though user instructions (i.e. AGENTS.md) may override these guidelines:\n\n- Fix the problem at the root cause rather than applying surface-level patches, when possible.\n- Avoid unneeded complexity in your solution.\n- Do not attempt to fix unrelated bugs or broken tests. It is not your responsibility to fix them. (You may mention them to the user in your final message though.)\n- Update documentation as necessary.\n- Keep changes consistent with the style of the existing codebase. Changes should be minimal and focused on the task.\n- Use `git log` and `git blame` to search the history of the codebase if additional context is required.\n- NEVER add copyright or license headers unless specifically requested.\n- Do not waste tokens by re-reading files after calling `apply_patch` on them. The tool call will fail if it didn\'t work. The same goes for making folders, deleting folders, etc.\n- Do not `git commit` your changes or create new git branches unless explicitly requested.\n- Do not add inline comments within code unless explicitly requested.\n- Do not use one-letter variable names unless explicitly requested.\n- NEVER output inline citations like "【F:README.md†L5-L14】" in your outputs. The CLI is not able to render these so they will just be broken in the UI. Instead, if you output valid filepaths, users will be able to click on them to open the files in their editor.\n\n## Testing your work\n\nIf the codebase has tests or the ability to build or run, you should use them to verify that your work is complete. Generally, your testing philosophy should be to start as specific as possible to the code you changed so that you can catch issues efficiently, then make your way to broader tests as you build confidence. If there\'s no test for the code you changed, and if the adjacent patterns in the codebases show that there\'s a logical place for you to add a test, you may do so. However, do not add tests to codebases with no tests, or where the patterns don\'t indicate so.\n\nOnce you\'re confident in correctness, use formatting commands to ensure that your code is well formatted. These commands can take time so you should run them on as precise a target as possible. If there are issues you can iterate up to 3 times to get formatting right, but if you still can\'t manage it\'s better to save the user time and present them a correct solution where you call out the formatting in your final message. If the codebase does not have a formatter configured, do not add one.\n\nFor all of testing, running, building, and formatting, do not attempt to fix unrelated bugs. It is not your responsibility to fix them. (You may mention them to the user in your final message though.)\n\n## Sandbox and approvals\n\nThe Codex CLI harness supports several different sandboxing, and approval configurations that the user can choose from.\n\nFilesystem sandboxing prevents you from editing files without user approval. The options are:\n- *read-only*: You can only read files.\n- *workspace-write*: You can read files. You can write to files in your workspace folder, but not outside it.\n- *danger-full-access*: No filesystem sandboxing.\n\nNetwork sandboxing prevents you from accessing network without approval. Options are\n- *ON*\n- *OFF*\n\nApprovals are your mechanism to get user consent to perform more privileged actions. Although they introduce friction to the user because your work is paused until the user responds, you should leverage them to accomplish your important work. Do not let these settings or the sandbox deter you from attempting to accomplish the user\'s task. Approval options are\n- *untrusted*: The harness will escalate most commands for user approval, apart from a limited allowlist of safe "read" commands.\n- *on-failure*: The harness will allow all commands to run in the sandbox (if enabled), and failures will be escalated to the user for approval to run again without the sandbox.\n- *on-request*: Commands will be run in the sandbox by default, and you can specify in your tool call if you want to escalate a command to run without sandboxing. (Note that this mode is not always available. If it is, you\'ll see parameters for it in the `shell` command description.)\n- *never*: This is a non-interactive mode where you may NEVER ask the user for approval to run commands. Instead, you must always persist and work around constraints to solve the task for the user. You MUST do your utmost best to finish the task and validate your work before yielding. If this mode is pared with `danger-full-access`, take advantage of it to deliver the best outcome for the user. Further, in this mode, your default testing philosophy is overridden: Even if you don\'t see local patterns for testing, you may add tests and scripts to validate your work. Just remove them before yielding.\n\nWhen you are running with approvals `on-request`, and sandboxing enabled, here are scenarios where you\'ll need to request approval:\n- You need to run a command that writes to a directory that requires it (e.g. running tests that write to /tmp)\n- You need to run a GUI app (e.g., open/xdg-open/osascript) to open browsers or files.\n- You are running sandboxed and need to run a command that requires network access (e.g. installing packages)\n- If you run a command that is important to solving the user\'s query, but it fails because of sandboxing, rerun the command with approval.\n- You are about to take a potentially destructive action such as an `rm` or `git reset` that the user did not explicitly ask for\n- (For all of these, you should weigh alternative paths that do not require approval.)\n\nNote that when sandboxing is set to read-only, you\'ll need to request approval for any command that isn\'t a read.\n\nYou will be told what filesystem sandboxing, network sandboxing, and approval mode are active in a developer or user message. If you are not told about this, assume that you are running with workspace-write, network sandboxing ON, and approval on-failure.\n\n## Ambition vs. precision\n\nFor tasks that have no prior context (i.e. the user is starting something brand new), you should feel free to be ambitious and demonstrate creativity with your implementation.\n\nIf you\'re operating in an existing codebase, you should make sure you do exactly what the user asks with surgical precision. Treat the surrounding codebase with respect, and don\'t overstep (i.e. changing filenames or variables unnecessarily). You should balance being sufficiently ambitious and proactive when completing tasks of this nature.\n\nYou should use judicious initiative to decide on the right level of detail and complexity to deliver based on the user\'s needs. This means showing good judgment that you\'re capable of doing the right extras without gold-plating. This might be demonstrated by high-value, creative touches when scope of the task is vague; while being surgical and targeted when scope is tightly specified.\n\n## Sharing progress updates\n\nFor especially longer tasks that you work on (i.e. requiring many tool calls, or a plan with multiple steps), you should provide progress updates back to the user at reasonable intervals. These updates should be structured as a concise sentence or two (no more than 8-10 words long) recapping progress so far in plain language: this update demonstrates your understanding of what needs to be done, progress so far (i.e. files explores, subtasks complete), and where you\'re going next.\n\nBefore doing large chunks of work that may incur latency as experienced by the user (i.e. writing a new file), you should send a concise message to the user with an update indicating what you\'re about to do to ensure they know what you\'re spending time on. Don\'t start editing or writing large files before informing the user what you are doing and why.\n\nThe messages you send before tool calls should describe what is immediately about to be done next in very concise language. If there was previous work done, this preamble message should also include a note about the work done so far to bring the user along.\n\n## Presenting your work and final message\n\nYour final message should read naturally, like an update from a concise teammate. For casual conversation, brainstorming tasks, or quick questions from the user, respond in a friendly, conversational tone. You should ask questions, suggest ideas, and adapt to the user’s style. If you\'ve finished a large amount of work, when describing what you\'ve done to the user, you should follow the final answer formatting guidelines to communicate substantive changes. You don\'t need to add structured formatting for one-word answers, greetings, or purely conversational exchanges.\n\nYou can skip heavy formatting for single, simple actions or confirmations. In these cases, respond in plain sentences with any relevant next step or quick option. Reserve multi-section structured responses for results that need grouping or explanation.\n\nThe user is working on the same computer as you, and has access to your work. As such there\'s no need to show the full contents of large files you have already written unless the user explicitly asks for them. Similarly, if you\'ve created or modified files using `apply_patch`, there\'s no need to tell users to "save the file" or "copy the code into a file"—just reference the file path.\n\nIf there\'s something that you think you could help with as a logical next step, concisely ask the user if they want you to do so. Good examples of this are running tests, committing changes, or building out the next logical component. If there’s something that you couldn\'t do (even with approval) but that the user might want to do (such as verifying changes by running the app), include those instructions succinctly.\n\nBrevity is very important as a default. You should be very concise (i.e. no more than 10 lines), but can relax this requirement for tasks where additional detail and comprehensiveness is important for the user\'s understanding.\n\n### Final answer structure and style guidelines\n\nYou are producing plain text that will later be styled by the CLI. Follow these rules exactly. Formatting should make results easy to scan, but not feel mechanical. Use judgment to decide how much structure adds value.\n\n**Section Headers**\n- Use only when they improve clarity — they are not mandatory for every answer.\n- Choose descriptive names that fit the content\n- Keep headers short (1–3 words) and in `**Title Case**`. Always start headers with `**` and end with `**`\n- Leave no blank line before the first bullet under a header.\n- Section headers should only be used where they genuinely improve scanability; avoid fragmenting the answer.\n\n**Bullets**\n- Use `-` followed by a space for every bullet.\n- Bold the keyword, then colon + concise description.\n- Merge related points when possible; avoid a bullet for every trivial detail.\n- Keep bullets to one line unless breaking for clarity is unavoidable.\n- Group into short lists (4–6 bullets) ordered by importance.\n- Use consistent keyword phrasing and formatting across sections.\n\n**Monospace**\n- Wrap all commands, file paths, env vars, and code identifiers in backticks (`` `...` ``).\n- Apply to inline examples and to bullet keywords if the keyword itself is a literal file/command.\n- Never mix monospace and bold markers; choose one based on whether it’s a keyword (`**`) or inline code/path (`` ` ``).\n\n**Structure**\n- Place related bullets together; don’t mix unrelated concepts in the same section.\n- Order sections from general → specific → supporting info.\n- For subsections (e.g., “Binaries” under “Rust Workspace”), introduce with a bolded keyword bullet, then list items under it.\n- Match structure to complexity:\n  - Multi-part or detailed results → use clear headers and grouped bullets.\n  - Simple results → minimal headers, possibly just a short list or paragraph.\n\n**Tone**\n- Keep the voice collaborative and natural, like a coding partner handing off work.\n- Be concise and factual — no filler or conversational commentary and avoid unnecessary repetition\n- Use present tense and active voice (e.g., “Runs tests” not “This will run tests”).\n- Keep descriptions self-contained; don’t refer to “above” or “below”.\n- Use parallel structure in lists for consistency.\n\n**Don’t**\n- Don’t use literal words “bold” or “monospace” in the content.\n- Don’t nest bullets or create deep hierarchies.\n- Don’t output ANSI escape codes directly — the CLI renderer applies them.\n- Don’t cram unrelated keywords into a single bullet; split for clarity.\n- Don’t let keyword lists run long — wrap or reformat for scanability.\n\nGenerally, ensure your final answers adapt their shape and depth to the request. For example, answers to code explanations should have a precise, structured explanation with code references that answer the question directly. For tasks with a simple implementation, lead with the outcome and supplement only with what’s needed for clarity. Larger changes can be presented as a logical walkthrough of your approach, grouping related steps, explaining rationale where it adds value, and highlighting next actions to accelerate the user. Your answers should provide the right level of detail while being easily scannable.\n\nFor casual greetings, acknowledgements, or other one-off conversational messages that are not delivering substantive information or structured results, respond naturally without section headers or bullet formatting.\n\n# Tools\n\n## `apply_patch`\n\nYour patch language is a stripped‑down, file‑oriented diff format designed to be easy to parse and safe to apply. You can think of it as a high‑level envelope:\n\n**_ Begin Patch\n[ one or more file sections ]\n_** End Patch\n\nWithin that envelope, you get a sequence of file operations.\nYou MUST include a header to specify the action you are taking.\nEach operation starts with one of three headers:\n\n**_ Add File: <path> - create a new file. Every following line is a + line (the initial contents).\n_** Delete File: <path> - remove an existing file. Nothing follows.\n\\*\\*\\* Update File: <path> - patch an existing file in place (optionally with a rename).\n\nMay be immediately followed by \\*\\*\\* Move to: <new path> if you want to rename the file.\nThen one or more “hunks”, each introduced by @@ (optionally followed by a hunk header).\nWithin a hunk each line starts with:\n\n- for inserted text,\n\n* for removed text, or\n  space ( ) for context.\n  At the end of a truncated hunk you can emit \\*\\*\\* End of File.\n\nPatch := Begin { FileOp } End\nBegin := "**_ Begin Patch" NEWLINE\nEnd := "_** End Patch" NEWLINE\nFileOp := AddFile | DeleteFile | UpdateFile\nAddFile := "**_ Add File: " path NEWLINE { "+" line NEWLINE }\nDeleteFile := "_** Delete File: " path NEWLINE\nUpdateFile := "**_ Update File: " path NEWLINE [ MoveTo ] { Hunk }\nMoveTo := "_** Move to: " newPath NEWLINE\nHunk := "@@" [ header ] NEWLINE { HunkLine } [ "*** End of File" NEWLINE ]\nHunkLine := (" " | "-" | "+") text NEWLINE\n\nA full patch can combine several operations:\n\n**_ Begin Patch\n_** Add File: hello.txt\n+Hello world\n**_ Update File: src/app.py\n_** Move to: src/main.py\n@@ def greet():\n-print("Hi")\n+print("Hello, world!")\n**_ Delete File: obsolete.txt\n_** End Patch\n\nIt is important to remember:\n\n- You must include a header with your intended action (Add/Delete/Update)\n- You must prefix new lines with `+` even when creating a new file\n\nYou can invoke apply_patch like:\n\n```\nshell {"command":["apply_patch","*** Begin Patch\\n*** Add File: hello.txt\\n+Hello, world!\\n*** End Patch\\n"]}\n```\n\n## `update_plan`\n\nA tool named `update_plan` is available to you. You can use it to keep an up‑to‑date, step‑by‑step plan for the task.\n\nTo create a new plan, call `update_plan` with a short list of 1‑sentence steps (no more than 5-7 words each) with a `status` for each step (`pending`, `in_progress`, or `completed`).\n\nWhen steps have been completed, use `update_plan` to mark each finished step as `completed` and the next step you are working on as `in_progress`. There should always be exactly one `in_progress` step until everything is done. You can mark multiple items as complete in a single `update_plan` call.\n\nIf all steps are complete, ensure you call `update_plan` to mark all steps as `completed`.\n'

      logger.info('📝 Non-Codex CLI request detected, applying Codex CLI adaptation')
    } else {
      logger.info('✅ Codex CLI request detected, forwarding as-is')
    }

    // 使用调度器选择账户
    const {
      accessToken,
      accountId,
      accountName: _accountName,
      proxy,
      account
    } = await getOpenAIAuthToken(apiKeyData, sessionId, requestedModel)
    // 基于白名单构造上游所需的请求头，确保键为小写且值受控
    const incoming = req.headers || {}

    const allowedKeys = ['version', 'openai-beta', 'session_id']

    const headers = {}
    for (const key of allowedKeys) {
      if (incoming[key] !== undefined) {
        headers[key] = incoming[key]
      }
    }

    // 覆盖或新增必要头部
    headers['authorization'] = `Bearer ${accessToken}`
    headers['chatgpt-account-id'] = account.accountId || account.chatgptUserId || accountId
    headers['host'] = 'chatgpt.com'
    headers['accept'] = isStream ? 'text/event-stream' : 'application/json'
    headers['content-type'] = 'application/json'
    req.body['store'] = false

    // 创建代理 agent
    const proxyAgent = createProxyAgent(proxy)

    // 配置请求选项
    const axiosConfig = {
      headers,
      timeout: 60000,
      validateStatus: () => true
    }

    // 如果有代理，添加代理配置
    if (proxyAgent) {
      axiosConfig.httpsAgent = proxyAgent
      logger.info(`🌐 Using proxy for OpenAI request: ${ProxyHelper.getProxyDescription(proxy)}`)
    } else {
      logger.debug('🌐 No proxy configured for OpenAI request')
    }

    // 根据 stream 参数决定请求类型
    if (isStream) {
      // 流式请求
      upstream = await axios.post('https://chatgpt.com/backend-api/codex/responses', req.body, {
        ...axiosConfig,
        responseType: 'stream'
      })
    } else {
      // 非流式请求
      upstream = await axios.post(
        'https://chatgpt.com/backend-api/codex/responses',
        req.body,
        axiosConfig
      )
    }
    res.status(upstream.status)

    if (isStream) {
      // 流式响应头
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
    } else {
      // 非流式响应头
      res.setHeader('Content-Type', 'application/json')
    }

    // 透传关键诊断头，避免传递不安全或与传输相关的头
    const passThroughHeaderKeys = ['openai-version', 'x-request-id', 'openai-processing-ms']
    for (const key of passThroughHeaderKeys) {
      const val = upstream.headers?.[key]
      if (val !== undefined) {
        res.setHeader(key, val)
      }
    }

    if (isStream) {
      // 立即刷新响应头，开始 SSE
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders()
      }
    }

    // 处理响应并捕获 usage 数据和真实的 model
    let buffer = ''
    let usageData = null
    let actualModel = null
    let usageReported = false

    if (!isStream) {
      // 非流式响应处理
      try {
        logger.info(`📄 Processing OpenAI non-stream response for model: ${requestedModel}`)

        // 直接获取完整响应
        const responseData = upstream.data

        // 从响应中获取实际的 model 和 usage
        actualModel = responseData.model || requestedModel || 'gpt-4'
        usageData = responseData.usage

        logger.debug(`📊 Non-stream response - Model: ${actualModel}, Usage:`, usageData)

        // 记录使用统计
        if (usageData) {
          const inputTokens = usageData.input_tokens || usageData.prompt_tokens || 0
          const outputTokens = usageData.output_tokens || usageData.completion_tokens || 0
          const cacheCreateTokens = usageData.input_tokens_details?.cache_creation_tokens || 0
          const cacheReadTokens = usageData.input_tokens_details?.cached_tokens || 0

          await apiKeyService.recordUsage(
            apiKeyData.id,
            inputTokens,
            outputTokens,
            cacheCreateTokens,
            cacheReadTokens,
            actualModel,
            accountId
          )

          logger.info(
            `📊 Recorded OpenAI non-stream usage - Input: ${inputTokens}, Output: ${outputTokens}, Total: ${usageData.total_tokens || inputTokens + outputTokens}, Model: ${actualModel}`
          )
        }

        // 返回响应
        res.json(responseData)
        return
      } catch (error) {
        logger.error('Failed to process non-stream response:', error)
        if (!res.headersSent) {
          res.status(500).json({ error: { message: 'Failed to process response' } })
        }
        return
      }
    }

    // 解析 SSE 事件以捕获 usage 数据和 model
    const parseSSEForUsage = (data) => {
      const lines = data.split('\n')

      for (const line of lines) {
        if (line.startsWith('event: response.completed')) {
          // 下一行应该是数据
          continue
        }

        if (line.startsWith('data: ')) {
          try {
            const jsonStr = line.slice(6) // 移除 'data: ' 前缀
            const eventData = JSON.parse(jsonStr)

            // 检查是否是 response.completed 事件
            if (eventData.type === 'response.completed' && eventData.response) {
              // 从响应中获取真实的 model
              if (eventData.response.model) {
                actualModel = eventData.response.model
                logger.debug(`📊 Captured actual model: ${actualModel}`)
              }

              // 获取 usage 数据
              if (eventData.response.usage) {
                usageData = eventData.response.usage
                logger.debug('📊 Captured OpenAI usage data:', usageData)
              }
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    upstream.data.on('data', (chunk) => {
      try {
        const chunkStr = chunk.toString()

        // 转发数据给客户端
        if (!res.destroyed) {
          res.write(chunk)
        }

        // 同时解析数据以捕获 usage 信息
        buffer += chunkStr

        // 处理完整的 SSE 事件
        if (buffer.includes('\n\n')) {
          const events = buffer.split('\n\n')
          buffer = events.pop() || '' // 保留最后一个可能不完整的事件

          for (const event of events) {
            if (event.trim()) {
              parseSSEForUsage(event)
            }
          }
        }
      } catch (error) {
        logger.error('Error processing OpenAI stream chunk:', error)
      }
    })

    upstream.data.on('end', async () => {
      // 处理剩余的 buffer
      if (buffer.trim()) {
        parseSSEForUsage(buffer)
      }

      // 记录使用统计
      if (!usageReported && usageData) {
        try {
          const inputTokens = usageData.input_tokens || 0
          const outputTokens = usageData.output_tokens || 0
          const cacheCreateTokens = usageData.input_tokens_details?.cache_creation_tokens || 0
          const cacheReadTokens = usageData.input_tokens_details?.cached_tokens || 0

          // 使用响应中的真实 model，如果没有则使用请求中的 model，最后回退到默认值
          const modelToRecord = actualModel || requestedModel || 'gpt-4'

          await apiKeyService.recordUsage(
            apiKeyData.id,
            inputTokens,
            outputTokens,
            cacheCreateTokens,
            cacheReadTokens,
            modelToRecord,
            accountId
          )

          logger.info(
            `📊 Recorded OpenAI usage - Input: ${inputTokens}, Output: ${outputTokens}, Total: ${usageData.total_tokens || inputTokens + outputTokens}, Model: ${modelToRecord} (actual: ${actualModel}, requested: ${requestedModel})`
          )
          usageReported = true
        } catch (error) {
          logger.error('Failed to record OpenAI usage:', error)
        }
      }

      res.end()
    })

    upstream.data.on('error', (err) => {
      logger.error('Upstream stream error:', err)
      if (!res.headersSent) {
        res.status(502).json({ error: { message: 'Upstream stream error' } })
      } else {
        res.end()
      }
    })

    // 客户端断开时清理上游流
    const cleanup = () => {
      try {
        upstream.data?.unpipe?.(res)
        upstream.data?.destroy?.()
      } catch (_) {
        //
      }
    }
    req.on('close', cleanup)
    req.on('aborted', cleanup)
  } catch (error) {
    logger.error('Proxy to ChatGPT codex/responses failed:', error)
    const status = error.response?.status || 500
    const message = error.response?.data || error.message || 'Internal server error'
    if (!res.headersSent) {
      res.status(status).json({ error: { message } })
    }
  }
})

// 使用情况统计端点
router.get('/usage', authenticateApiKey, async (req, res) => {
  try {
    const { usage } = req.apiKey

    res.json({
      object: 'usage',
      total_tokens: usage.total.tokens,
      total_requests: usage.total.requests,
      daily_tokens: usage.daily.tokens,
      daily_requests: usage.daily.requests,
      monthly_tokens: usage.monthly.tokens,
      monthly_requests: usage.monthly.requests
    })
  } catch (error) {
    logger.error('Failed to get usage stats:', error)
    res.status(500).json({
      error: {
        message: 'Failed to retrieve usage statistics',
        type: 'api_error'
      }
    })
  }
})

// API Key 信息端点
router.get('/key-info', authenticateApiKey, async (req, res) => {
  try {
    const keyData = req.apiKey
    res.json({
      id: keyData.id,
      name: keyData.name,
      description: keyData.description,
      permissions: keyData.permissions || 'all',
      token_limit: keyData.tokenLimit,
      tokens_used: keyData.usage.total.tokens,
      tokens_remaining:
        keyData.tokenLimit > 0
          ? Math.max(0, keyData.tokenLimit - keyData.usage.total.tokens)
          : null,
      rate_limit: {
        window: keyData.rateLimitWindow,
        requests: keyData.rateLimitRequests
      },
      usage: {
        total: keyData.usage.total,
        daily: keyData.usage.daily,
        monthly: keyData.usage.monthly
      }
    })
  } catch (error) {
    logger.error('Failed to get key info:', error)
    res.status(500).json({
      error: {
        message: 'Failed to retrieve API key information',
        type: 'api_error'
      }
    })
  }
})

module.exports = router

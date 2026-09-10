# Claude 1M Context Alias Normalization

## Background

Claude Code enables 1M context by sending the normal upstream model name together with the Anthropic beta header:

```text
model: claude-opus-4-8
anthropic-beta: ...,context-1m-2025-08-07,...
```

CRS may expose `[1m]` suffixed model names such as `claude-opus-4-8[1m]` to users and tooling as an internal convenience for selecting or accounting for long-context mode. Anthropic does not recognize the `[1m]` suffix as part of the model id.

This mismatch can break Claude Code auto mode safety checks. Auto mode uses a small non-streaming classifier request, for example:

```text
POST /v1/messages?beta=true
model: claude-opus-4-8
max_tokens: 64
stream: false
```

If CRS forwards the internal alias as `claude-opus-4-8[1m]`, upstream can reject the model. Claude Code then reports the classifier as unavailable, for example:

```text
claude-opus-4-8[1m] is temporarily unavailable,
so auto mode cannot determine the safety of Bash right now.
```

## Change

The long-context handling is now centralized in `src/utils/claudeLongContextHelper.js`.

The helper treats `[1m]` as a CRS-local alias:

- Strip a trailing `[1m]` suffix before forwarding requests upstream.
- Preserve the original request semantics by adding `context-1m-2025-08-07` to `anthropic-beta`.
- Merge beta headers without duplicating beta flags.
- Leave ordinary model names unchanged.

Example:

```js
normalizeClaudePayloadForUpstream(
  { model: 'claude-opus-4-8[1m]' },
  'oauth-2025-04-20'
)
```

returns:

```js
{
  body: { model: 'claude-opus-4-8' },
  betaHeader: 'oauth-2025-04-20,context-1m-2025-08-07',
  isLongContextAlias: true
}
```

## Relay Coverage

The helper is applied at the relay boundary, after scheduling and model mapping but before the request is sent upstream.

Covered paths:

- `src/services/relay/claudeRelayService.js`
  - Claude Official OAuth relay.
  - Shared request preparation for streaming and non-streaming requests.
- `src/services/relay/claudeConsoleRelayService.js`
  - Claude Console non-streaming relay.
  - Claude Console streaming relay.
- `src/services/relay/ccrRelayService.js`
  - CCR non-streaming relay.
  - CCR streaming relay.

This keeps upstream normalization close to the outbound boundary while allowing CRS internals to keep using the original requested model for scheduling, restrictions, usage records, and pricing decisions.

## Why This Shape

The `[1m]` suffix is useful inside CRS because it is visible in model selection and usage accounting. It should not become part of the Anthropic wire request.

Centralizing the behavior avoids three separate relay implementations drifting apart:

- Official OAuth already rebuilds `anthropic-beta` dynamically.
- Console and CCR pass selected headers through axios.
- All three need the same model normalization rule.

Keeping the helper small also makes the invariant easy to test:

```text
CRS internal model alias: claude-opus-4-8[1m]
Anthropic upstream model: claude-opus-4-8
Required beta flag:       context-1m-2025-08-07
```

## Verification

Syntax checks:

```bash
node --check src/utils/claudeLongContextHelper.js
node --check src/services/relay/claudeRelayService.js
node --check src/services/relay/claudeConsoleRelayService.js
node --check src/services/relay/ccrRelayService.js
```

Manual helper check:

```bash
node -e "const h=require('./src/utils/claudeLongContextHelper'); console.log(h.normalizeClaudePayloadForUpstream({model:'claude-opus-4-8[1m]'}, 'oauth-2025-04-20'))"
```

Expected behavior:

- Upstream model is `claude-opus-4-8`.
- `anthropic-beta` contains `context-1m-2025-08-07`.
- Existing beta flags are preserved.
- The beta flag is not duplicated if the client already sent it.

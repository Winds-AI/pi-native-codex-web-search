# pi-native-codex-web-search

Native web search for Pi using the same API and auth as Codex CLI.

## Demo

![demo](demo-short.mp4)
*(2x speed)*

## Why Codex as the middleman?

During development, we discovered that **web search is not a standalone tool** — it's a native feature built into OpenAI's Responses API. Here's what we found:

### The architecture problem

When you use Codex and ask it to search the web, this happens:

1. Codex calls OpenAI's Responses API with `{ "type": "web_search" }` in the tools array
2. OpenAI's configured model in cli natively decides when to search and handles it
3. The search results come back as part of the model's response stream

The web search tool is **not** something Codex implements — it's OpenAI's built-in capability that Codex configures and passes through.

### Why we can't call OpenAI directly

We tried calling `api.openai.com/v1/responses` directly with the OAuth token from Pi's auth file. It failed with:

```
401: Missing scopes: api.responses.write
```

ChatGPT/Codex OAuth tokens are scoped for Codex's specific backend, not the standard OpenAI API. The standard API requires API keys with `api.responses.write` scope.

### The solution: ChatGPT's backend API

Codex actually calls a different endpoint:

```
https://chatgpt.com/backend-api/codex/responses
```

This endpoint:
- Accepts ChatGPT OAuth tokens (from `~/.codex/auth.json`)
- Requires `stream: true` and `store: false`
- Uses configured model
- Supports the native `web_search` tool

So this extension calls the **exact same API** that Codex CLI uses, with the **exact same auth**. It's not wrapping the Codex CLI — it's reimplementing the same API call that Codex makes internally.

## Requirements

- Node.js 22+
- Codex CLI installed and authenticated (`codex login`)

## Install

```bash
pi install git:github.com/Winds-AI/pi-native-codex-web-search
```

## Tool: `web_search`

| Parameter | Description |
|-----------|-------------|
| `query` | What to search for |
| `maxSources` | Max sources (1-10, default: 5) |
| `freshness` | `cached` (default) or `live` for time-sensitive |

## Auth

Uses credentials from `~/.codex/auth.json`. If search fails, run:

```bash
codex login
```

## License

CC0-1.0

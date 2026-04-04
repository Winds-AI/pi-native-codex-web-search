import { getCodexAuth } from "./auth.js";
import {
  CODEX_API_ENDPOINT,
  DEFAULT_MAX_SOURCES,
  DEFAULT_MODEL,
  MAX_ALLOWED_SOURCES,
  SEARCH_TIMEOUT_MS,
} from "./constants.js";
import type { WebSearchInput, WebSearchSource } from "./types.js";

const SEARCH_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          snippet: { type: "string" },
        },
        required: ["title", "url", "snippet"],
      },
    },
  },
  required: ["summary", "sources"],
};

function buildSearchPrompt(query: string, maxSources: number, freshness: string): string {
  return [
    "You are performing web research for a coding agent.",
    "Search the public web and answer the user's query using current online sources.",
    freshness === "live"
      ? "Prioritize the most recent and up-to-date information available."
      : "Cached results are fine; prioritize accuracy over recency.",
    "Return ONLY a JSON object matching this schema:",
    JSON.stringify(SEARCH_OUTPUT_SCHEMA),
    "Do not wrap the JSON in markdown fences or add any extra commentary.",
    `Keep the summary concise and useful. Limit sources to at most ${maxSources} items.`,
    "Prefer primary or official sources when available.",
    "Each source snippet should be short and directly relevant.",
    "",
    `User query: ${query}`,
  ].join("\n");
}

interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
}

function parseSSE(text: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  let event = "";
  let data = "";

  for (const line of text.split("\n")) {
    if (line.startsWith("event: ")) {
      event = line.slice(7);
    } else if (line.startsWith("data: ")) {
      data = line.slice(6);
    } else if (line === "" && event && data) {
      try {
        events.push({ type: event, data: JSON.parse(data) });
      } catch {}
      event = "";
      data = "";
    }
  }

  return events;
}

export async function executeWebSearch(
  input: WebSearchInput,
  options?: {
    signal?: AbortSignal;
    onUpdate?: (update: { content: { type: "text"; text: string }[]; details: unknown }) => void;
  }
) {
  const query = input.query.trim();
  if (!query) throw new Error("web_search requires a non-empty query.");

  const maxSources = Math.min(
    Math.max(Math.trunc(input.maxSources ?? DEFAULT_MAX_SOURCES), 1),
    MAX_ALLOWED_SOURCES
  );
  const freshness = input.freshness ?? "cached";
  const auth = await getCodexAuth();

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), SEARCH_TIMEOUT_MS);
  options?.signal?.addEventListener("abort", () => abortController.abort(options.signal?.reason), { once: true });

  try {
    const response = await fetch(CODEX_API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.accessToken}`,
        "ChatGPT-Account-ID": auth.accountId,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        instructions: buildSearchPrompt(query, maxSources, freshness),
        input: [{ role: "user", content: `Search the web for: ${query}` }],
        tools: [{ type: "web_search" }],
        store: false,
        stream: true,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const error = await response.text().catch(() => "Unknown error");
      if (response.status === 401) throw new Error("Authentication failed. Run `codex login`.");
      if (response.status === 429) throw new Error("Rate limited. Try again in a moment.");
      throw new Error(`API error (${response.status}): ${error}`);
    }

    // Extract text from SSE stream
    let rawOutput = "";
    for (const event of parseSSE(await response.text())) {
      if (event.type === "response.output_text.delta") {
        rawOutput += event.data.delta ?? "";
      }
    }

    if (!rawOutput) throw new Error("Empty response from API.");

    // Parse JSON response
    const parsed = JSON.parse(rawOutput) as { summary: string; sources: WebSearchSource[] };
    const sources = parsed.sources.slice(0, maxSources);
    const summary = parsed.summary.trim();
    if (!summary) throw new Error("Empty summary in response.");

    // Format result
    const lines = [summary];
    if (sources.length > 0) {
      lines.push("", "Sources:");
      sources.forEach((s, i) => {
        lines.push(`${i + 1}. ${s.title}`, `   ${s.url}`);
        if (s.snippet) lines.push(`   ${s.snippet}`);
      });
    }

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
      details: { query, freshness, sourceCount: sources.length, sources, summary, truncated: false },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

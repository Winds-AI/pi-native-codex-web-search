import { StringEnum } from "@mariozechner/pi-ai";
import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { AuthError, checkAuth } from "./auth.js";
import { TOOL_NAME } from "./constants.js";
import { executeWebSearch } from "./search.js";
import type { WebSearchDetails, WebSearchInput } from "./types.js";

export default function nativeWebSearchExtension(pi: ExtensionAPI) {
  let authError: string | null = null;

  checkAuth().catch((error) => {
    authError = error instanceof AuthError ? error.message : String(error);
  });

  pi.registerTool({
    name: TOOL_NAME,
    label: "Web Search",
    description:
      "Search the public web and return a concise summary with sources. Use cached freshness for stable topics and live freshness for time-sensitive queries.",
    parameters: Type.Object({
      query: Type.String({ description: "What to search for on the web" }),
      maxSources: Type.Optional(
        Type.Integer({ minimum: 1, maximum: 10, description: "Maximum number of sources (default: 5)" })
      ),
      freshness: Type.Optional(
        StringEnum(["cached", "live"] as const, {
          description: "Use 'cached' for stable topics, 'live' for time-sensitive queries.",
        })
      ),
    }),
    async execute(_toolCallId, params: WebSearchInput, signal, onUpdate, _ctx) {
      if (authError) {
        throw new Error(`Web search unavailable: ${authError}\n\nRun \`codex login\` to authenticate.`);
      }
      return executeWebSearch(params, { signal, onUpdate });
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("web_search "));
      text += theme.fg("accent", args.query.length > 90 ? args.query.slice(0, 89) + "…" : args.query);
      text += theme.fg("dim", ` [${args.freshness ?? "cached"}]`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded }, theme) {
      const details = result.details as Partial<WebSearchDetails> | undefined;
      const content = result.content.find((p) => p.type === "text");
      const text = content?.type === "text" ? content.text : "";

      if (!details?.sourceCount) {
        return new Text(text || theme.fg("success", "✓ Web search finished"), 0, 0);
      }

      let status = theme.fg("success", `✓ ${details.sourceCount} source${details.sourceCount === 1 ? "" : "s"}`);
      status += theme.fg("muted", ` [${details.freshness}]`);

      if (!expanded) {
        status += theme.fg("dim", " (Ctrl+O to expand)");
        if (details.summary) {
          const preview = details.summary.length > 110 ? details.summary.slice(0, 109) + "…" : details.summary;
          status += `\n${theme.fg("dim", preview)}`;
        }
        return new Text(status, 0, 0);
      }

      status += `\n${theme.fg("muted", `Query: ${details.query}`)}`;
      if (text) {
        status += `\n\n${text.split("\n").map(l => theme.fg("toolOutput", l)).join("\n")}`;
      }
      return new Text(status, 0, 0);
    },
  });
}

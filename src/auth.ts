import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CODEX_AUTH_PATH = join(homedir(), ".codex", "auth.json");

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

interface CodexAuthFile {
  auth_mode?: string;
  tokens?: {
    id_token?: string;
    access_token: string;
    refresh_token?: string;
    account_id: string;
  };
}

/**
 * Get Codex's auth credentials for web search.
 * Uses ~/.codex/auth.json which contains ChatGPT OAuth tokens.
 */
export async function getCodexAuth(): Promise<{ accessToken: string; accountId: string }> {
  try {
    const raw = await readFile(CODEX_AUTH_PATH, "utf-8");
    const auth = JSON.parse(raw) as CodexAuthFile;

    if (!auth.tokens?.access_token) {
      throw new AuthError(
        "No access token found in Codex auth file. Please run `codex login` to authenticate."
      );
    }

    if (!auth.tokens?.account_id) {
      throw new AuthError(
        "No account ID found in Codex auth file. Please run `codex login` to authenticate."
      );
    }

    return {
      accessToken: auth.tokens.access_token,
      accountId: auth.tokens.account_id,
    };
  } catch (error) {
    if (error instanceof AuthError) throw error;

    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new AuthError(
        "Codex auth file not found at ~/.codex/auth.json.\n\n" +
        "Please run `codex login` to authenticate with OpenAI/Codex."
      );
    }

    throw new AuthError(
      `Failed to read Codex auth file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Verify that we can get Codex auth credentials.
 */
export async function checkAuth(): Promise<void> {
  await getCodexAuth();
}

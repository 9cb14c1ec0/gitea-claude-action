/**
 * Resolve action inputs (passed as env vars by action.yml) into a typed config,
 * and resolve the Gitea/GitHub token used for API calls.
 */

export type Config = {
  /** Phrases that trigger Claude (matched case-insensitively). */
  triggerPhrases: string[];
  /** Primary phrase, used for display in the prompt. */
  triggerPhrase: string;
  assigneeTrigger: string;
  labelTrigger: string;
  baseBranch?: string;
  branchPrefix: string;
  model?: string;
  fallbackModel?: string;
  allowedTools: string[];
  disallowedTools: string[];
  customInstructions: string;
  maxTurns?: number;
  timeoutMinutes: number;
  gitName: string;
  gitEmail: string;
};

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\n\r]+/)
    .map((s) => s.replace(/#.*$/, "").trim())
    .filter((s) => s.length > 0);
}

export function loadConfig(): Config {
  const maxTurnsRaw = process.env.MAX_TURNS?.trim();
  const parsedPhrases = splitList(process.env.TRIGGER_PHRASE);
  // Default to @claude and @ClaudeCode; matching is case-insensitive, so
  // @Claude, @claudecode, etc. are covered too.
  const triggerPhrases =
    parsedPhrases.length > 0 ? parsedPhrases : ["@claude", "@ClaudeCode"];
  return {
    triggerPhrases,
    triggerPhrase: triggerPhrases[0]!,
    assigneeTrigger: process.env.ASSIGNEE_TRIGGER || "",
    labelTrigger: process.env.LABEL_TRIGGER || "",
    baseBranch: process.env.BASE_BRANCH || undefined,
    branchPrefix: process.env.BRANCH_PREFIX || "claude/",
    model: process.env.MODEL || undefined,
    fallbackModel: process.env.FALLBACK_MODEL || undefined,
    allowedTools: splitList(process.env.ALLOWED_TOOLS),
    disallowedTools: splitList(process.env.DISALLOWED_TOOLS),
    customInstructions: process.env.CUSTOM_INSTRUCTIONS || "",
    maxTurns: maxTurnsRaw ? Number(maxTurnsRaw) : undefined,
    timeoutMinutes: Number(process.env.TIMEOUT_MINUTES || "30"),
    gitName: process.env.CLAUDE_GIT_NAME || "Claude",
    gitEmail: process.env.CLAUDE_GIT_EMAIL || "claude@anthropic.com",
  };
}

/** Token used for Gitea API calls: explicit gitea_token, else GITHUB_TOKEN. */
export function resolveToken(): string {
  const token =
    process.env.OVERRIDE_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
  if (!token) {
    throw new Error(
      "No token available. Provide a `gitea_token` input or ensure GITHUB_TOKEN is set in the workflow environment.",
    );
  }
  return token;
}

/** Verify exactly one Claude auth credential is present. */
export function assertAuth(): void {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    throw new Error(
      "No Claude credentials found. Set `anthropic_api_key` or `claude_code_oauth_token`.",
    );
  }
}

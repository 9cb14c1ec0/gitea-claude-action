/**
 * Run Claude via the Agent SDK, in-process. Registers the gitea + git tool
 * servers, streams the message log to stdout, and returns the final result.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { Config } from "./config";

const BUILTIN_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "Glob",
  "Grep",
  "LS",
  "Bash",
  "TodoWrite",
];

const GITEA_TOOLS = [
  "mcp__gitea__update_comment",
  "mcp__gitea__get_pull_request",
  "mcp__gitea__get_issue",
  "mcp__gitea__list_branches",
  "mcp__gitea__create_pull_request",
];

const GIT_TOOLS = [
  "mcp__git__status",
  "mcp__git__create_branch",
  "mcp__git__checkout_branch",
  "mcp__git__commit",
  "mcp__git__delete_files",
  "mcp__git__push",
];

const DEFAULT_DISALLOWED = ["WebSearch", "WebFetch"];

export type AgentResult = {
  success: boolean;
  costUsd: number;
  numTurns: number;
  resultText?: string;
};

export async function runAgent(
  prompt: string,
  config: Config,
  cwd: string,
  servers: Record<string, McpSdkServerConfigWithInstance>,
): Promise<AgentResult> {
  const allowedTools = [
    ...BUILTIN_TOOLS,
    ...GITEA_TOOLS,
    ...GIT_TOOLS,
    ...config.allowedTools,
  ];

  const disallowedTools = [
    ...DEFAULT_DISALLOWED.filter((t) => !config.allowedTools.includes(t)),
    ...config.disallowedTools,
  ];

  const result: AgentResult = {
    success: false,
    costUsd: 0,
    numTurns: 0,
  };

  const iterator = query({
    prompt,
    options: {
      cwd,
      mcpServers: servers,
      allowedTools,
      disallowedTools,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      // Load the repo's CLAUDE.md / project settings for context.
      settingSources: ["project"],
      ...(config.model ? { model: config.model } : {}),
      ...(config.fallbackModel ? { fallbackModel: config.fallbackModel } : {}),
      ...(config.maxTurns ? { maxTurns: config.maxTurns } : {}),
      ...(config.customInstructions
        ? {
            systemPrompt: {
              type: "preset",
              preset: "claude_code",
              append: config.customInstructions,
            },
          }
        : {}),
    },
  });

  for await (const message of iterator) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          console.log(`[claude] ${block.text}`);
        } else if (block.type === "tool_use") {
          console.log(`[claude] -> ${block.name}`);
        }
      }
    } else if (message.type === "result") {
      result.numTurns = message.num_turns;
      result.costUsd = message.total_cost_usd;
      result.success = message.subtype === "success" && !message.is_error;
      if (message.subtype === "success") {
        result.resultText = message.result;
      }
    }
  }

  return result;
}

/**
 * Build the prompt handed to Claude. Embeds the pre-fetched issue/PR context
 * and tells Claude how to communicate (only via the tracking comment) and how
 * to make changes (git tools + branch strategy).
 */

import type { GiteaContext } from "./gitea/context";
import { triggerBody, triggerUser } from "./gitea/context";
import {
  formatBody,
  formatChangedFiles,
  formatComments,
  formatContext,
  type FetchedData,
} from "./gitea/data";
import { sanitizeContent } from "./gitea/sanitizer";
import type { BranchInfo } from "./branch";
import type { Config } from "./config";

export function buildPrompt(
  ctx: GiteaContext,
  data: FetchedData,
  branch: BranchInfo,
  config: Config,
  commentId: number,
): string {
  const isPR = ctx.isPR;
  const user = triggerUser(ctx) ?? "Unknown";
  const trigger = triggerBody(ctx);

  const branchGuidance =
    isPR && !branch.needsNewBranch
      ? `You are on the PR branch \`${branch.currentBranch}\`. Commit and push directly to it with the mcp__git__ tools; do not create a new branch.`
      : `You are on the base branch \`${branch.baseBranch}\`. If you need to make changes, first check mcp__gitea__list_branches for an existing \`${config.branchPrefix}${isPR ? "pr" : "issue"}-${ctx.entityNumber}-*\` branch and mcp__git__checkout_branch onto it, otherwise mcp__git__create_branch a new one named \`${config.branchPrefix}${isPR ? "pr" : "issue"}-${ctx.entityNumber}-<short-description>\`. After committing and pushing, open a PR with mcp__gitea__create_pull_request.`;

  return `You are Claude, an AI assistant responding to a Gitea ${isPR ? "pull request" : "issue"}. Analyze the context below and act on the request.

<context>
${formatContext(data.entity, isPR)}
</context>

<${isPR ? "pr" : "issue"}_body>
${formatBody(data.entity.body)}
</${isPR ? "pr" : "issue"}_body>

<comments>
${formatComments(data.comments)}
</comments>
${
  isPR
    ? `\n<changed_files>\n${formatChangedFiles(data.changedFiles)}\n</changed_files>\n`
    : ""
}
${
  trigger
    ? `<trigger_comment>\n${sanitizeContent(trigger)}\n</trigger_comment>\n`
    : ""
}
<metadata>
repository: ${ctx.repository.fullName}
${isPR ? "pr" : "issue"}_number: ${ctx.entityNumber}
triggered_by: ${user}
trigger_phrase: ${config.triggerPhrase}
tracking_comment_id: ${commentId}
</metadata>

## How to communicate
- ALL communication with the user happens by editing your tracking comment via the \`mcp__gitea__update_comment\` tool. Your plain text responses are NOT shown to the user.
- Maintain a Markdown task checklist in that comment (\`- [ ]\` / \`- [x]\`) and update it as you progress.
- Keep the job-run link that is already in the comment at the bottom.
- Use \`###\` (h3) for section headers, never \`#\`.

## What to do
1. Read the trigger ${trigger ? "in <trigger_comment>" : isPR ? "from the PR body/title" : "from the issue body/title"} and figure out what is being asked. Only act on the trigger — other comments are context only.
2. If it is a question or code review, investigate with the Read/Grep/Glob tools and post your answer/review by updating the tracking comment.
3. If code changes are requested:
   - ${branchGuidance}
   - Edit files locally, then commit with \`mcp__git__commit\` and push with \`mcp__git__push\`.
   - Follow the repository's existing conventions; read \`CLAUDE.md\` if present.
4. When done, update the tracking comment with a short summary of what you did (and anything you could not do).

## Limits
- You cannot run arbitrary commands unless they are explicitly allowed.
- You communicate only by editing the single tracking comment — never create new comments.
${config.customInstructions ? `\n## Custom instructions\n${config.customInstructions}\n` : ""}`;
}

/**
 * In-process SDK MCP server exposing the Gitea API operations Claude needs:
 * updating its tracking comment, reading issue/PR data, and opening PRs.
 * Tools are exposed to Claude as mcp__gitea__<tool>. The server shares the
 * already-authenticated GiteaClient, so no tokens are passed through env.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { GiteaClient } from "../gitea/client";
import type { GiteaContext } from "../gitea/context";
import { isReviewComment } from "../comment";

type Text = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(text: string): Text {
  return { content: [{ type: "text", text }] };
}
function err(text: string): Text {
  return { content: [{ type: "text", text }], isError: true };
}

export type CommentTarget = {
  /** ID of the tracking comment Claude updates. */
  commentId: number;
};

export function createGiteaServer(
  client: GiteaClient,
  ctx: GiteaContext,
  target: CommentTarget,
) {
  const { owner, repo } = ctx.repository;
  const reviewComment = isReviewComment(ctx);

  return createSdkMcpServer({
    name: "gitea",
    version: "0.1.0",
    tools: [
      tool(
        "update_comment",
        "Update YOUR tracking comment. This is the ONLY way the user sees your progress, answers, and results — your normal text responses are not visible to them. Call this with the full new comment body whenever you want to communicate.",
        {
          body: z.string().describe("The full new comment body (Markdown)"),
        },
        async ({ body }) => {
          try {
            if (reviewComment) {
              await client.updatePullRequestComment(
                owner,
                repo,
                target.commentId,
                body,
              );
            } else {
              await client.updateIssueComment(
                owner,
                repo,
                target.commentId,
                body,
              );
            }
            return ok(`Updated comment ${target.commentId}`);
          } catch (e) {
            return err(`update_comment failed: ${e}`);
          }
        },
      ),

      tool(
        "get_pull_request",
        "Get details of a pull request.",
        {
          pull_number: z.number().describe("PR number"),
        },
        async ({ pull_number }) => {
          try {
            const { data } = await client.getPullRequest(
              owner,
              repo,
              pull_number,
            );
            return ok(JSON.stringify(data, null, 2));
          } catch (e) {
            return err(`get_pull_request failed: ${e}`);
          }
        },
      ),

      tool(
        "get_issue",
        "Get details of an issue.",
        {
          issue_number: z.number().describe("Issue number"),
        },
        async ({ issue_number }) => {
          try {
            const { data } = await client.getIssue(owner, repo, issue_number);
            return ok(JSON.stringify(data, null, 2));
          } catch (e) {
            return err(`get_issue failed: ${e}`);
          }
        },
      ),

      tool(
        "list_branches",
        "List branches in the repository.",
        {},
        async () => {
          try {
            const { data } = await client.listBranches(owner, repo);
            const names = (data || []).map((b: any) => b.name);
            return ok(JSON.stringify(names, null, 2));
          } catch (e) {
            return err(`list_branches failed: ${e}`);
          }
        },
      ),

      tool(
        "create_pull_request",
        "Open a new pull request.",
        {
          title: z.string().describe("PR title"),
          body: z.string().optional().describe("PR description"),
          head: z.string().describe("Head branch (the branch with changes)"),
          base: z.string().describe("Base branch to merge into"),
        },
        async ({ title, body, head, base }) => {
          try {
            const { data } = await client.createPullRequest(owner, repo, {
              title,
              body,
              head,
              base,
            });
            return ok(
              `Created PR #${data.number}: ${data.html_url ?? data.url ?? ""}`,
            );
          } catch (e) {
            return err(`create_pull_request failed: ${e}`);
          }
        },
      ),
    ],
  });
}

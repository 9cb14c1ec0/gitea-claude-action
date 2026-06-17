/**
 * The single tracking comment Claude posts and then edits as it works.
 * Created up front with a "working" spinner; Claude updates it via the
 * mcp__gitea__update_comment tool.
 */

import type { GiteaClient } from "./gitea/client";
import { GITEA_SERVER_URL } from "./gitea/client";
import type { GiteaContext } from "./gitea/context";

const SPINNER =
  '<img src="https://github.com/user-attachments/assets/5ac382c7-e004-429b-8e35-7feb3e8f9c6f" width="14px" height="14px" style="vertical-align: middle; margin-left: 4px;" />';

export function jobRunLink(owner: string, repo: string, runId: string): string {
  const url = `${GITEA_SERVER_URL}/${owner}/${repo}/actions/runs/${runId}`;
  return `[View job run](${url})`;
}

export function branchLink(
  owner: string,
  repo: string,
  branch: string,
): string {
  const url = `${GITEA_SERVER_URL}/${owner}/${repo}/src/branch/${branch}`;
  return `[\`${branch}\`](${url})`;
}

export function initialBody(link: string): string {
  return `Claude is working… ${SPINNER}\n\n${link}`;
}

/** Whether the trigger comment is a PR review (inline) comment. */
export function isReviewComment(ctx: GiteaContext): boolean {
  return ctx.eventName === "pull_request_review_comment";
}

export async function createInitialComment(
  client: GiteaClient,
  ctx: GiteaContext,
): Promise<number> {
  const { owner, repo } = ctx.repository;
  const body = initialBody(jobRunLink(owner, repo, ctx.runId));

  // PR review comments support threaded replies; everything else is a plain
  // issue/PR comment.
  if (isReviewComment(ctx) && ctx.payload.comment?.id) {
    try {
      const res = await client.request(
        "POST",
        `/repos/${owner}/${repo}/pulls/${ctx.entityNumber}/comments/${ctx.payload.comment.id}/replies`,
        { body },
      );
      return res.data.id;
    } catch (err) {
      console.warn(`Review-comment reply failed, falling back: ${err}`);
    }
  }

  const res = await client.createIssueComment(
    owner,
    repo,
    ctx.entityNumber,
    body,
  );
  return res.data.id;
}

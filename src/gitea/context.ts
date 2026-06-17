/**
 * Parse the webhook event that triggered the workflow into a normalized
 * context. Reads the raw event payload directly from GITHUB_EVENT_PATH so we
 * don't depend on @actions/github, and accounts for the places Gitea's
 * payloads differ from GitHub's (notably `review.content` vs `review.body`
 * and top-level `sender`).
 */

import { readFileSync } from "fs";

export type GiteaEventName =
  | "issues"
  | "issue_comment"
  | "pull_request"
  | "pull_request_review"
  | "pull_request_review_comment";

export type GiteaContext = {
  runId: string;
  eventName: string;
  eventAction?: string;
  repository: { owner: string; repo: string; fullName: string };
  actor: string;
  payload: any;
  /** Issue or PR number this event concerns. */
  entityNumber: number;
  isPR: boolean;
};

function readPayload(): any {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    console.warn(`Could not read event payload at ${path}: ${err}`);
    return {};
  }
}

function resolveRepository(payload: any): {
  owner: string;
  repo: string;
  fullName: string;
} {
  // Prefer the payload, fall back to GITHUB_REPOSITORY=owner/repo.
  const repoObj = payload.repository;
  if (repoObj?.owner?.login && repoObj?.name) {
    return {
      owner: repoObj.owner.login,
      repo: repoObj.name,
      fullName: `${repoObj.owner.login}/${repoObj.name}`,
    };
  }
  const full = process.env.GITHUB_REPOSITORY ?? "";
  const [owner, repo] = full.split("/");
  return { owner: owner ?? "", repo: repo ?? "", fullName: full };
}

export function parseContext(): GiteaContext {
  const payload = readPayload();
  const eventName = process.env.GITHUB_EVENT_NAME ?? "";
  const repository = resolveRepository(payload);

  const base = {
    runId: process.env.GITHUB_RUN_ID ?? "",
    eventName,
    eventAction: payload.action as string | undefined,
    repository,
    actor: process.env.GITHUB_ACTOR ?? payload.sender?.login ?? "",
    payload,
  };

  switch (eventName) {
    case "issues":
      return { ...base, entityNumber: payload.issue?.number, isPR: false };
    case "issue_comment":
      return {
        ...base,
        entityNumber: payload.issue?.number,
        isPR: Boolean(payload.issue?.pull_request),
      };
    case "pull_request":
      return {
        ...base,
        entityNumber: payload.pull_request?.number,
        isPR: true,
      };
    case "pull_request_review":
      return {
        ...base,
        entityNumber: payload.pull_request?.number,
        isPR: true,
      };
    case "pull_request_review_comment":
      return {
        ...base,
        entityNumber: payload.pull_request?.number,
        isPR: true,
      };
    default:
      throw new Error(`Unsupported event type: ${eventName}`);
  }
}

/**
 * The comment/review body that triggered this event, accounting for Gitea's
 * `review.content` field. Returns undefined for events without a trigger body.
 */
export function triggerBody(ctx: GiteaContext): string | undefined {
  const p = ctx.payload;
  switch (ctx.eventName) {
    case "issue_comment":
    case "pull_request_review_comment":
      return p.comment?.body ?? p.review?.content;
    case "pull_request_review":
      return p.review?.body ?? p.review?.content;
    case "issues":
      return p.issue?.body;
    case "pull_request":
      return p.pull_request?.body;
    default:
      return undefined;
  }
}

/** Login of the user who triggered the event. */
export function triggerUser(ctx: GiteaContext): string | undefined {
  const p = ctx.payload;
  return (
    p.comment?.user?.login ??
    p.review?.user?.login ??
    p.issue?.user?.login ??
    p.pull_request?.user?.login ??
    p.sender?.login ??
    ctx.actor
  );
}

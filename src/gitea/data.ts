/**
 * Fetch the issue/PR context that gets embedded into Claude's prompt, and
 * format it as readable text. All requests go through the REST client, which
 * works against both Gitea and GitHub.
 */

import type { GiteaClient } from "./client";
import { sanitizeContent } from "./sanitizer";

export type EntityData = {
  title: string;
  body: string;
  author: string;
  state: string;
  // PR-only fields
  baseRef?: string;
  headRef?: string;
  additions?: number;
  deletions?: number;
};

export type Comment = {
  author: string;
  body: string;
  createdAt: string;
};

export type ChangedFile = {
  path: string;
  additions: number;
  deletions: number;
  changeType: string;
};

export type FetchedData = {
  entity: EntityData;
  comments: Comment[];
  changedFiles: ChangedFile[];
};

export async function fetchData(
  client: GiteaClient,
  owner: string,
  repo: string,
  num: number,
  isPR: boolean,
): Promise<FetchedData> {
  let entity: EntityData;
  let changedFiles: ChangedFile[] = [];

  if (isPR) {
    const { data: pr } = await client.getPullRequest(owner, repo, num);
    entity = {
      title: pr.title,
      body: pr.body || "",
      author: pr.user?.login || "",
      state: String(pr.state || "").toUpperCase(),
      baseRef: pr.base?.ref,
      headRef: pr.head?.ref,
      additions: pr.additions || 0,
      deletions: pr.deletions || 0,
    };

    try {
      const { data: files } = await client.listPullRequestFiles(
        owner,
        repo,
        num,
      );
      changedFiles = (files || []).map((f: any) => ({
        path: f.filename,
        additions: f.additions || 0,
        deletions: f.deletions || 0,
        changeType: f.status || "modified",
      }));
    } catch (err) {
      console.warn(`Could not fetch PR files: ${err}`);
    }
  } else {
    const { data: issue } = await client.getIssue(owner, repo, num);
    entity = {
      title: issue.title,
      body: issue.body || "",
      author: issue.user?.login || "",
      state: String(issue.state || "").toUpperCase(),
    };
  }

  let comments: Comment[] = [];
  try {
    const { data: raw } = await client.listIssueComments(owner, repo, num);
    comments = (raw || []).map((c: any) => ({
      author: c.user?.login || "",
      body: c.body || "",
      createdAt: c.created_at || "",
    }));
  } catch (err) {
    console.warn(`Could not fetch comments: ${err}`);
  }

  return { entity, comments, changedFiles };
}

export function formatContext(entity: EntityData, isPR: boolean): string {
  if (isPR) {
    return [
      `PR Title: ${entity.title}`,
      `PR Author: ${entity.author}`,
      `PR Branch: ${entity.headRef} -> ${entity.baseRef}`,
      `PR State: ${entity.state}`,
      `PR Additions: ${entity.additions}`,
      `PR Deletions: ${entity.deletions}`,
    ].join("\n");
  }
  return [
    `Issue Title: ${entity.title}`,
    `Issue Author: ${entity.author}`,
    `Issue State: ${entity.state}`,
  ].join("\n");
}

export function formatBody(body: string): string {
  return sanitizeContent(body) || "No description provided";
}

export function formatComments(comments: Comment[]): string {
  if (comments.length === 0) return "No comments";
  return comments
    .map((c) => `[${c.author} at ${c.createdAt}]: ${sanitizeContent(c.body)}`)
    .join("\n\n");
}

export function formatChangedFiles(files: ChangedFile[]): string {
  if (files.length === 0) return "No files changed";
  return files
    .map((f) => `- ${f.path} (${f.changeType}) +${f.additions}/-${f.deletions}`)
    .join("\n");
}

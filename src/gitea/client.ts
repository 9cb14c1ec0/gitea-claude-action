/**
 * Minimal REST client for the Gitea API (also works against GitHub's
 * `/api/v1`-compatible surface). Auth uses a `token <token>` header, which
 * both Gitea and GitHub accept.
 */

function deriveApiUrl(serverUrl: string): string {
  if (serverUrl.includes("github.com")) {
    return "https://api.github.com";
  }
  return `${serverUrl}/api/v1`;
}

/** Server URL, preferring an explicit GITEA_SERVER_URL over the Actions-provided one. */
export function getServerUrl(): string {
  const explicit = process.env.GITEA_SERVER_URL;
  if (explicit) return explicit;

  const fromActions = process.env.GITHUB_SERVER_URL;
  if (fromActions) return fromActions;

  return "https://github.com";
}

export const GITEA_SERVER_URL = getServerUrl();
export const GITEA_API_URL =
  process.env.GITEA_API_URL || deriveApiUrl(GITEA_SERVER_URL);

export type ApiResponse<T = any> = {
  status: number;
  data: T;
};

export class GiteaClient {
  readonly baseUrl: string;
  private readonly token: string;

  constructor(token: string, baseUrl: string = GITEA_API_URL) {
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async request<T = any>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `token ${this.token}`,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data: any = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const message =
        (data && typeof data === "object" && data.message) ||
        (typeof data === "string" && data) ||
        res.statusText;
      throw new Error(
        `Gitea API ${method} ${path} failed: ${res.status} ${message}`,
      );
    }

    return { status: res.status, data: data as T };
  }

  // --- Repository ---
  getRepo(owner: string, repo: string) {
    return this.request("GET", `/repos/${owner}/${repo}`);
  }
  listBranches(owner: string, repo: string) {
    return this.request("GET", `/repos/${owner}/${repo}/branches`);
  }

  // --- Issues ---
  getIssue(owner: string, repo: string, num: number) {
    return this.request("GET", `/repos/${owner}/${repo}/issues/${num}`);
  }
  listIssueComments(owner: string, repo: string, num: number) {
    return this.request(
      "GET",
      `/repos/${owner}/${repo}/issues/${num}/comments`,
    );
  }
  createIssueComment(owner: string, repo: string, num: number, body: string) {
    return this.request(
      "POST",
      `/repos/${owner}/${repo}/issues/${num}/comments`,
      { body },
    );
  }
  updateIssueComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string,
  ) {
    return this.request(
      "PATCH",
      `/repos/${owner}/${repo}/issues/comments/${commentId}`,
      { body },
    );
  }

  // --- Pull requests ---
  getPullRequest(owner: string, repo: string, num: number) {
    return this.request("GET", `/repos/${owner}/${repo}/pulls/${num}`);
  }
  listPullRequestFiles(owner: string, repo: string, num: number) {
    return this.request("GET", `/repos/${owner}/${repo}/pulls/${num}/files`);
  }
  updatePullRequestComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string,
  ) {
    return this.request(
      "PATCH",
      `/repos/${owner}/${repo}/pulls/comments/${commentId}`,
      { body },
    );
  }
  createPullRequest(
    owner: string,
    repo: string,
    data: { title: string; body?: string; head: string; base: string },
  ) {
    return this.request("POST", `/repos/${owner}/${repo}/pulls`, data);
  }
}

import { describe, expect, test } from "bun:test";
import { checkTrigger, escapeRegExp } from "../src/trigger";
import type { GiteaContext } from "../src/gitea/context";
import type { Config } from "../src/config";

const baseConfig: Config = {
  triggerPhrase: "@claude",
  assigneeTrigger: "claude-bot",
  labelTrigger: "claude",
  branchPrefix: "claude/",
  allowedTools: [],
  disallowedTools: [],
  customInstructions: "",
  timeoutMinutes: 30,
  gitName: "Claude",
  gitEmail: "claude@anthropic.com",
};

function ctx(overrides: Partial<GiteaContext>): GiteaContext {
  return {
    runId: "1",
    eventName: "issue_comment",
    repository: { owner: "o", repo: "r", fullName: "o/r" },
    actor: "alice",
    payload: {},
    entityNumber: 1,
    isPR: false,
    ...overrides,
  };
}

describe("checkTrigger", () => {
  test("matches phrase in an issue comment", () => {
    const c = ctx({
      eventName: "issue_comment",
      payload: { comment: { body: "hey @claude please help" } },
    });
    expect(checkTrigger(c, baseConfig)).toBe(true);
  });

  test("ignores phrase embedded in a larger word", () => {
    const c = ctx({
      eventName: "issue_comment",
      payload: { comment: { body: "email me @claudexyz" } },
    });
    expect(checkTrigger(c, baseConfig)).toBe(false);
  });

  test("matches Gitea review using review.content", () => {
    const c = ctx({
      eventName: "pull_request_review",
      eventAction: "submitted",
      isPR: true,
      payload: { review: { content: "@claude take a look" } },
    });
    expect(checkTrigger(c, baseConfig)).toBe(true);
  });

  test("matches assignee trigger on assignment", () => {
    const c = ctx({
      eventName: "issues",
      eventAction: "assigned",
      payload: { issue: { assignee: { login: "claude-bot" } } },
    });
    expect(checkTrigger(c, baseConfig)).toBe(true);
  });

  test("matches label trigger case-insensitively", () => {
    const c = ctx({
      eventName: "issues",
      eventAction: "labeled",
      payload: { label: { name: "Claude" } },
    });
    expect(checkTrigger(c, baseConfig)).toBe(true);
  });

  test("matches phrase in a newly opened issue body", () => {
    const c = ctx({
      eventName: "issues",
      eventAction: "opened",
      payload: { issue: { body: "Please @claude fix this", title: "bug" } },
    });
    expect(checkTrigger(c, baseConfig)).toBe(true);
  });

  test("no trigger when phrase absent", () => {
    const c = ctx({
      eventName: "issue_comment",
      payload: { comment: { body: "just a normal comment" } },
    });
    expect(checkTrigger(c, baseConfig)).toBe(false);
  });
});

describe("escapeRegExp", () => {
  test("escapes regex metacharacters", () => {
    expect(escapeRegExp("a.b*c")).toBe("a\\.b\\*c");
  });
});

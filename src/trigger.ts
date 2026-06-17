/**
 * Decide whether Claude should respond to this event: an explicit mention of
 * the trigger phrase, an assignment to the trigger user, or a matching label.
 */

import type { GiteaContext } from "./gitea/context";
import { triggerBody } from "./gitea/context";
import type { Config } from "./config";

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-phrase match bounded by start/end or surrounding whitespace/punctuation. */
function mentions(text: string, phrase: string): boolean {
  if (!text || !phrase) return false;
  const re = new RegExp(`(^|\\s)${escapeRegExp(phrase)}([\\s.,!?;:]|$)`);
  return re.test(text);
}

export function checkTrigger(ctx: GiteaContext, config: Config): boolean {
  const { triggerPhrase, assigneeTrigger, labelTrigger } = config;
  const p = ctx.payload;

  // Assignee trigger (on assignment or issue creation).
  if (
    ctx.eventName === "issues" &&
    (ctx.eventAction === "assigned" || ctx.eventAction === "opened")
  ) {
    const wanted = assigneeTrigger.replace(/^@/, "");
    const assignee = p.issue?.assignee?.login || "";
    if (wanted && assignee === wanted) return true;
  }

  // Label trigger.
  if (ctx.eventName === "issues" && ctx.eventAction === "labeled") {
    const wanted = labelTrigger.trim();
    const applied = p.label?.name?.trim();
    if (
      wanted &&
      applied &&
      wanted.localeCompare(applied, undefined, { sensitivity: "accent" }) === 0
    ) {
      return true;
    }
  }

  // Phrase in newly-opened issue body/title.
  if (ctx.eventName === "issues" && ctx.eventAction === "opened") {
    if (
      mentions(p.issue?.body || "", triggerPhrase) ||
      mentions(p.issue?.title || "", triggerPhrase)
    ) {
      return true;
    }
  }

  // Phrase in PR body/title, or trigger user as requested reviewer.
  if (ctx.eventName === "pull_request") {
    const pr = p.pull_request || {};
    if (
      mentions(pr.body || "", triggerPhrase) ||
      mentions(pr.title || "", triggerPhrase)
    ) {
      return true;
    }
    const user = triggerPhrase.replace(/^@/, "");
    const reviewers: any[] = pr.requested_reviewers || [];
    if (reviewers.some((r) => r?.login === user)) return true;
  }

  // Phrase in a comment or review body.
  if (
    ctx.eventName === "issue_comment" ||
    ctx.eventName === "pull_request_review" ||
    ctx.eventName === "pull_request_review_comment"
  ) {
    if (mentions(triggerBody(ctx) || "", triggerPhrase)) return true;
  }

  return false;
}

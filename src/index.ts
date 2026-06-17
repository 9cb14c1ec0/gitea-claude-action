#!/usr/bin/env bun
/**
 * Entry point. One process, run once per workflow trigger:
 *   parse context -> check trigger -> fetch data -> post tracking comment ->
 *   set up branch -> build prompt -> run Claude (Agent SDK) -> report status.
 */

import { appendFileSync } from "fs";
import { loadConfig, resolveToken, assertAuth } from "./config";
import { parseContext } from "./gitea/context";
import { GiteaClient } from "./gitea/client";
import { checkTrigger } from "./trigger";
import { fetchData } from "./gitea/data";
import { createInitialComment } from "./comment";
import { setupBranch } from "./branch";
import { buildPrompt } from "./prompt";
import { runAgent } from "./agent";
import { createGiteaServer } from "./tools/gitea-tools";
import { createGitServer } from "./tools/git-tools";

function setOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file) {
    appendFileSync(file, `${name}=${value}\n`);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const ctx = parseContext();
  const token = resolveToken();
  const client = new GiteaClient(token);

  console.log(
    `Event: ${ctx.eventName} (${ctx.eventAction ?? "-"}) on ${ctx.repository.fullName}#${ctx.entityNumber}`,
  );

  // 1. Trigger check — exit quietly if not triggered.
  if (!checkTrigger(ctx, config)) {
    console.log("Trigger phrase not found; nothing to do.");
    setOutput("triggered", "false");
    return;
  }
  setOutput("triggered", "true");

  // Only check Claude credentials once we know we're acting.
  assertAuth();

  const cwd = process.env.GITHUB_WORKSPACE || process.cwd();

  // 2. Fetch issue/PR data.
  const { owner, repo } = ctx.repository;
  const data = await fetchData(client, owner, repo, ctx.entityNumber, ctx.isPR);

  // 3. Post the tracking comment Claude will edit.
  const commentId = await createInitialComment(client, ctx);
  setOutput("comment_id", String(commentId));

  // 4. Set up the working branch.
  const branch = await setupBranch(client, ctx, data.entity, config);
  setOutput("base_branch", branch.baseBranch);
  setOutput("current_branch", branch.currentBranch);

  // 5. Build the prompt + in-process tool servers.
  const prompt = buildPrompt(ctx, data, branch, config, commentId);
  const servers = {
    gitea: createGiteaServer(client, ctx, { commentId }),
    git: createGitServer(config, cwd),
  };

  // 6. Run Claude.
  console.log("Running Claude…");
  const result = await runAgent(prompt, config, cwd, servers);

  console.log(
    `Done. success=${result.success} turns=${result.numTurns} cost=$${result.costUsd.toFixed(4)}`,
  );
  setOutput("conclusion", result.success ? "success" : "failure");
  setOutput("cost_usd", result.costUsd.toFixed(4));

  if (!result.success) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Action failed:", err);
  process.exit(1);
});

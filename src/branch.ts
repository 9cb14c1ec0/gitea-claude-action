/**
 * Check out the right branch before handing control to Claude:
 * - open PR  -> check out the PR head branch (Claude pushes to it directly)
 * - issue or closed/merged PR -> check out the base branch; Claude creates a
 *   working branch when it needs to make changes.
 */

import { $ } from "bun";
import type { GiteaClient } from "./gitea/client";
import type { GiteaContext } from "./gitea/context";
import type { EntityData } from "./gitea/data";
import type { Config } from "./config";

export type BranchInfo = {
  baseBranch: string;
  currentBranch: string;
  /** Set when Claude should create its own branch (issues / closed PRs). */
  needsNewBranch: boolean;
};

export async function setupBranch(
  client: GiteaClient,
  ctx: GiteaContext,
  entity: EntityData,
  config: Config,
): Promise<BranchInfo> {
  const { owner, repo } = ctx.repository;

  let sourceBranch = config.baseBranch;
  if (!sourceBranch) {
    const { data: repoData } = await client.getRepo(owner, repo);
    sourceBranch = repoData.default_branch;
  }

  if (ctx.isPR) {
    const state = entity.state;
    if (state === "CLOSED" || state === "MERGED") {
      await $`git fetch origin --depth=1 ${sourceBranch}`;
      await $`git checkout ${sourceBranch}`;
      return {
        baseBranch: sourceBranch!,
        currentBranch: sourceBranch!,
        needsNewBranch: true,
      };
    }

    const head = entity.headRef!;
    await $`git fetch origin --depth=20 ${head}`;
    await $`git checkout ${head}`;
    return {
      baseBranch: entity.baseRef || sourceBranch!,
      currentBranch: head,
      needsNewBranch: false,
    };
  }

  // Issue: stay on the base branch.
  await $`git fetch origin --depth=1 ${sourceBranch}`;
  await $`git checkout ${sourceBranch}`;
  return {
    baseBranch: sourceBranch!,
    currentBranch: sourceBranch!,
    needsNewBranch: true,
  };
}

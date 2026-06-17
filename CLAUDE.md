# CLAUDE.md

Guidance for working in this repository.

## What this is

A Gitea/GitHub Action that runs Claude in-process via the Claude Agent SDK
(`@anthropic-ai/claude-agent-sdk`) to respond to issues and PRs. Runtime: Bun.

## Commands

```bash
bun install
bun test
bun run typecheck   # tsc --noEmit
bun run format
```

## Architecture

One composite action (`action.yml`) runs one process (`src/index.ts`):
parse context → check trigger → fetch data → post tracking comment → set up
branch → build prompt → run Claude → report. There is no nested action and no
separately-installed Claude binary; the Agent SDK bundles its runtime.

Claude's tools are defined **in-process** as SDK MCP servers in `src/tools/`:

- `gitea` (`mcp__gitea__*`) — update the tracking comment, read issue/PR data,
  open PRs. Shares the authenticated `GiteaClient`.
- `git` (`mcp__git__*`) — local commit/push/branch operations.

To add a tool: add it to the relevant server in `src/tools/`, then add its
`mcp__<server>__<name>` to the allow-list in `src/agent.ts`.

## Conventions

- Keep the action Gitea-native: don't assume GitHub-only payload shapes. New
  webhook handling goes through `src/gitea/context.ts` (note `review.content`).
- Prefer the REST client in `src/gitea/client.ts` over ad-hoc fetch calls.
- Update `README.md` and `action.yml` when adding/removing inputs.

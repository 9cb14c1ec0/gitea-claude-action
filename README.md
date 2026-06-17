# Gitea Claude Action

Run [Claude](https://claude.com/claude-code) inside Gitea (or GitHub) Actions to
respond to issues and pull requests. Mention `@claude` in a comment, issue, or
PR — or assign/label an issue — and Claude investigates, answers, and (when
asked) implements changes on a branch and opens a PR.

This is a from-scratch rebuild of the original `claude-code-gitea-action`,
designed to be Gitea-native and to run Claude **in-process via the
[Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)**
rather than shelling out to a separately-installed CLI.

## How it works

A single composite action runs one Bun process (`src/index.ts`):

1. **Parse context** — reads the webhook payload from `GITHUB_EVENT_PATH`,
   normalizing Gitea's quirks (e.g. `review.content` vs `review.body`).
2. **Check the trigger** — phrase mention, assignee, or label. Exits quietly if
   not triggered.
3. **Fetch data** — issue/PR details, comments, and changed files via the REST
   API (works on both Gitea and GitHub).
4. **Post a tracking comment** — the single comment Claude edits as it works.
5. **Set up the branch** — checks out the PR branch (open PRs) or the base
   branch (issues / closed PRs).
6. **Run Claude** — `query()` from the Agent SDK, with two **in-process** MCP
   tool servers:
   - `mcp__gitea__*` — update the tracking comment, read issue/PR data, open PRs.
   - `mcp__git__*` — commit, push, create/checkout branches locally.
7. **Report** — sets `triggered`, `conclusion`, and `cost_usd` outputs.

No Claude binary is installed — the Agent SDK npm package bundles its runtime,
so there is exactly one install step (`bun install`).

## Usage

```yaml
# .gitea/workflows/claude.yml
name: Claude
on:
  issue_comment:
    types: [created]
  issues:
    types: [opened, assigned, labeled]
  pull_request:
    types: [opened]

jobs:
  claude:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: your-org/gitea-claude-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          gitea_token: ${{ secrets.GITEA_TOKEN }}
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `trigger_phrase` | `@claude` | Phrase that triggers Claude. |
| `assignee_trigger` | `""` | Username whose assignment triggers Claude. |
| `label_trigger` | `""` | Label whose application triggers Claude. |
| `base_branch` | repo default | Base branch for new branches. |
| `branch_prefix` | `claude/` | Prefix for branches Claude creates. |
| `model` | SDK default | Model to use (e.g. `claude-opus-4-8`). |
| `fallback_model` | `""` | Fallback model if the primary is overloaded. |
| `allowed_tools` | `""` | Extra tools to allow (comma/newline separated). |
| `disallowed_tools` | `""` | Tools to disallow. `WebSearch`/`WebFetch` are off by default. |
| `custom_instructions` | `""` | Appended to Claude's system prompt. |
| `max_turns` | `""` | Max agent turns (blank = no limit). |
| `timeout_minutes` | `30` | Timeout for the run. |
| `claude_git_name` | `Claude` | `git user.name` for commits. |
| `claude_git_email` | `claude@anthropic.com` | `git user.email` for commits. |
| `anthropic_api_key` | — | Anthropic API key. |
| `claude_code_oauth_token` | — | OAuth token (alternative to the API key). |
| `gitea_token` | `GITHUB_TOKEN` | Token with repo + PR permissions. |

## Outputs

| Output | Description |
| --- | --- |
| `triggered` | `'true'`/`'false'` — whether the trigger matched. |
| `conclusion` | `'success'`/`'failure'` for the Claude run. |
| `cost_usd` | Total cost of the run in USD. |

## Self-hosted Gitea URLs

The action derives the API URL from `GITHUB_SERVER_URL` (set by the runner). If
your runner sees an internal URL but you want links/API calls to use a public
one, set `GITEA_SERVER_URL` in the job `env`.

## Development

```bash
bun install
bun test            # unit tests
bun run typecheck   # tsc --noEmit
bun run format      # prettier
```

## Project layout

```
action.yml              # single composite action
src/
  index.ts              # orchestrator (one process)
  config.ts             # inputs + token/auth resolution
  trigger.ts            # trigger detection
  branch.ts             # branch checkout strategy
  comment.ts            # tracking comment + links
  prompt.ts             # prompt builder
  agent.ts              # Agent SDK query() runner
  gitea/                # client, context, data fetch/format, sanitizer
  tools/                # in-process SDK MCP servers (gitea, git)
test/                   # unit tests
```

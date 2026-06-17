/**
 * In-process SDK MCP server exposing local git operations. Runs in the same
 * process as the action (no spawned subprocess), so it shares config directly.
 * Tools are exposed to Claude as mcp__git__<tool>.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { execFileSync } from "child_process";
import type { Config } from "../config";

type Text = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(text: string): Text {
  return { content: [{ type: "text", text }] };
}
function err(text: string): Text {
  return { content: [{ type: "text", text }], isError: true };
}

export function createGitServer(config: Config, cwd: string) {
  function git(args: string[]): string {
    return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
  }

  function ensureUser(): void {
    try {
      git(["config", "user.email"]);
    } catch {
      git(["config", "user.email", config.gitEmail]);
    }
    try {
      git(["config", "user.name"]);
    } catch {
      git(["config", "user.name", config.gitName]);
    }
  }

  return createSdkMcpServer({
    name: "git",
    version: "0.1.0",
    tools: [
      tool(
        "status",
        "Show the current branch and working-tree status.",
        {},
        async () => {
          try {
            const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
            const status = git(["status", "--porcelain"]);
            return ok(
              `Current branch: ${branch}\nStatus:\n${status || "clean"}`,
            );
          } catch (e) {
            return err(`git status failed: ${e}`);
          }
        },
      ),

      tool(
        "create_branch",
        "Create and check out a new branch from a base branch.",
        {
          branch_name: z.string().describe("Name of the branch to create"),
          base_branch: z.string().describe("Base branch to branch from"),
        },
        async ({ branch_name, base_branch }) => {
          try {
            git(["checkout", base_branch]);
            try {
              git(["pull", "origin", base_branch]);
            } catch {
              /* base may not be on remote yet */
            }
            git(["checkout", "-b", branch_name]);
            return ok(`Created and checked out branch: ${branch_name}`);
          } catch (e) {
            return err(`create_branch failed: ${e}`);
          }
        },
      ),

      tool(
        "checkout_branch",
        "Check out an existing branch, fetching it from the remote if needed.",
        {
          branch_name: z.string().describe("Branch to check out"),
          create_if_missing: z
            .boolean()
            .optional()
            .describe("Create the branch if it does not exist (default false)"),
        },
        async ({ branch_name, create_if_missing = false }) => {
          try {
            let exists = false;
            try {
              git(["rev-parse", "--verify", branch_name]);
              exists = true;
            } catch {
              try {
                git(["fetch", "origin", `${branch_name}:${branch_name}`]);
                exists = true;
              } catch {
                /* not on remote */
              }
            }
            if (!exists && create_if_missing) {
              git(["checkout", "-b", branch_name]);
              return ok(`Created and checked out new branch: ${branch_name}`);
            }
            if (!exists) {
              return err(
                `Branch '${branch_name}' not found locally or on remote. Pass create_if_missing=true to create it.`,
              );
            }
            git(["checkout", branch_name]);
            return ok(`Checked out branch: ${branch_name}`);
          } catch (e) {
            return err(`checkout_branch failed: ${e}`);
          }
        },
      ),

      tool(
        "commit",
        "Stage the given files and commit them to the current branch.",
        {
          files: z
            .array(z.string())
            .describe("File paths relative to the repository root"),
          message: z.string().describe("Commit message"),
        },
        async ({ files, message }) => {
          try {
            ensureUser();
            for (const f of files) {
              git(["add", "--", f.replace(/^\/+/, "")]);
            }
            git(["commit", "-m", message]);
            return ok(`Committed ${files.length} file(s): ${files.join(", ")}`);
          } catch (e) {
            return err(`commit failed: ${e}`);
          }
        },
      ),

      tool(
        "delete_files",
        "Remove the given files and commit the deletion.",
        {
          files: z.array(z.string()).describe("File paths to delete"),
          message: z.string().describe("Commit message for the deletion"),
        },
        async ({ files, message }) => {
          try {
            ensureUser();
            for (const f of files) {
              git(["rm", "--", f.replace(/^\/+/, "")]);
            }
            git(["commit", "-m", message]);
            return ok(`Deleted ${files.length} file(s): ${files.join(", ")}`);
          } catch (e) {
            return err(`delete_files failed: ${e}`);
          }
        },
      ),

      tool(
        "push",
        "Push the current branch to origin.",
        {
          force: z.boolean().optional().describe("Force push (use sparingly)"),
        },
        async ({ force = false }) => {
          try {
            const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
            const args = ["push"];
            if (force) args.push("-f");
            args.push("origin", branch);
            git(args);
            return ok(`Pushed branch: ${branch}`);
          } catch (e) {
            return err(`push failed: ${e}`);
          }
        },
      ),
    ],
  });
}

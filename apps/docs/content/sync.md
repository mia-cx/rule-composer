---
title: Sync Command
created: 2026-02-08
modified: 2026-02-08
---

# Sync command

Sync the repo’s **rules**, **skills**, **agents**, and (for Cursor) **commands** with the active tool’s global config (e.g. `~/.cursor/rules/`, `~/.cursor/skills/`, `~/.cursor/agents/`, `~/.cursor/commands/`). A **tree prompt** lets you pick the **source** to sync. Sources are discovered by scanning the repo for any directory that contains at least one of `rules/`, `skills/`, `agents/`, or `commands/` (up to 5 levels deep); the tree cascades from repo root so you can expand and pick (e.g. repo root or `coding-tools/cursor/`). Use `--yes` to skip and use repo root. All configured categories for that source are synced. After choosing direction (push, pull, or diff), for push/pull you are asked whether to **delete stale items** (destination items not present at the source). Default is no.

**Repo layout:** If the project has a canonical layout (`rules/`, `skills/`, `agents/`, `commands/` at repo root), the CLI asks whether to use that layout for sync; otherwise it uses the active tool’s schema (e.g. `.cursor/rules/`, `.cursor/skills/` for Cursor). Use `--yes` to skip the prompt and default to canonical when present.

## Usage

```bash
pnpm sync push   # repo → global
pnpm sync pull   # global → repo
pnpm sync diff   # show differences only (no writes)
```

If you omit the direction, the CLI prompts you to choose push, pull, or diff. For push/pull, you are then asked whether to delete stale items.

## Options

| Option       | Description                                                                 |
| ------------ | --------------------------------------------------------------------------- |
| `--repo`     | Path to the repo root (default: current working directory)                 |
| `--tool`     | Tool ID (default: `cursor`). Only tools with at least one of `GLOBAL_RULES`, `GLOBAL_SKILLS`, `GLOBAL_AGENTS`, or `GLOBAL_COMMANDS` in `TOOL_VARIABLES` are valid. |
| `--yes` / `-y` | Skip all confirmations (including the delete-stale prompt). When skipped, stale items are **not** removed. |
| `--cursor-db` | **(Cursor only)** Sync rules to/from Cursor’s **User Rules** SQLite database instead of `~/.cursor/rules/`. User Rules are stored in `state.vscdb` (key `aicontext.personalContext`). Push = compose repo `rules/` into one blob and write to the DB; pull = read from DB and write to `rules/cursor-user-rules.md`. Use **`pnpm sync inspect --cursor-db`** to list keys in the DB — if rules don’t show in Cursor Settings, Cursor may be using **cloud sync**. Close Cursor before writing to the DB. |

## Examples

```bash
# Push selected categories to ~/.cursor/
pnpm sync push

# Pull from ~/.cursor/ into repo (--yes skips delete-stale prompt; no stale deletion)
pnpm sync pull --yes

# Push repo rules/ into Cursor’s User Rules (Settings → Rules for AI) via SQLite DB
pnpm sync push --cursor-db

# Inspect Cursor state DB (list keys; confirm aicontext.personalContext)
pnpm sync inspect --cursor-db

# See what would change without writing
pnpm sync diff

# Sync a different repo and tool
pnpm sync pull --repo ~/other-repo --tool claude
```

## Implementation

Sync uses Node fs (recursive copy in `scripts/sync/sync-dir.ts`) with an optional delete-stale step; `diff -rq` for diff. Rules with `--cursor-db` use the cursor-db compose/write path. The `sync-agent-config` skill is a pointer to this CLI; use `pnpm sync` instead of manual copy.

## Note on Cursor User Rules

Cursor does **not** provide a public API to read or write a user’s global User Rules (Settings → Rules for AI). The only programmatic option is the local SQLite database (`state.vscdb`, key `aicontext.personalContext`), which `--cursor-db` uses. In many Cursor versions, User Rules are synced to the cloud and the Settings UI may read from the cloud, so writes to the local DB might not appear in Settings. For reliable, scriptable rules, use **project rules** (`.cursor/rules/*.mdc`) or **AGENTS.md** in the repo instead.

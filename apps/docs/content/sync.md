---
title: Sync Command
created: 2026-02-08
modified: 2026-02-08
---

# Sync command

Sync the repo’s `rules/` and `skills/` directories with the active tool’s global config (e.g. `~/.cursor/rules/`, `~/.cursor/skills/` for Cursor). Useful when the repo is the source of truth and you want to push changes to global config, or pull changes made in global config back into the repo.

## Usage

```bash
pnpm sync push   # repo → global
pnpm sync pull   # global → repo
pnpm sync diff   # show differences only (no writes)
```

If you omit the direction, the CLI prompts you to choose push, pull, or diff.

## Options

| Option       | Description                                                                 |
| ------------ | --------------------------------------------------------------------------- |
| `--repo`     | Path to the repo root (default: current working directory)                 |
| `--tool`     | Tool ID (default: `cursor`). Only tools with `GLOBAL_RULES` or `GLOBAL_SKILLS` in `TOOL_VARIABLES` are valid. |
| `--yes` / `-y` | Skip confirmation before push or pull (sync uses `rsync --delete`, which removes destination files not present at the source) |
| `--cursor-db` | **(Cursor only)** Sync rules to/from Cursor’s **User Rules** SQLite database instead of `~/.cursor/rules/`. User Rules are stored in `state.vscdb` (key `aicontext.personalContext`). Push = compose repo `rules/` into one blob and write to the DB; pull = read from DB and write to `rules/cursor-user-rules.md`. Use **`pnpm sync inspect --cursor-db`** to list keys in the DB and confirm the key we use — if rules still don’t show in Cursor Settings, Cursor may be using **cloud sync** and the UI might not read the local DB. Close Cursor before writing to the DB to avoid lock issues. |

## Examples

```bash
# Push repo rules/skills to ~/.cursor/
pnpm sync push

# Pull from ~/.cursor/ into repo (e.g. after creating rules in Cursor)
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

Sync uses `rsync -av --delete` for push and pull, and `diff -rq` for diff. The `sync-agent-config` skill is a pointer to this CLI; use `pnpm sync` instead of running rsync manually.

## Note on Cursor User Rules

Cursor does **not** provide a public API to read or write a user’s global User Rules (Settings → Rules for AI). The only programmatic option is the local SQLite database (`state.vscdb`, key `aicontext.personalContext`), which `--cursor-db` uses. In many Cursor versions, User Rules are synced to the cloud and the Settings UI may read from the cloud, so writes to the local DB might not appear in Settings. For reliable, scriptable rules, use **project rules** (`.cursor/rules/*.mdc`) or **AGENTS.md** in the repo instead.

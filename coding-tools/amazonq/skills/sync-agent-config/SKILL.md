---
name: sync-agent-config
description: Sync global Amazon Q rules and skills between the agents repo and the global config directory. Use when the user wants to push local changes to global config, pull global config into the repo, or check for drift between the two.
---

# Sync Agent Config

Use the built-in sync command:

- **Push** (repo → global): `pnpm sync push`
- **Pull** (global → repo): `pnpm sync pull`
- **Diff** (show differences): `pnpm sync diff`

Options: `--repo <path>`, `--tool <id>`, `--yes` to skip confirmation before destructive sync.

See README or docs for details.

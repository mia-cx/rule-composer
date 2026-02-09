---
title: "sync.test.ts"
created: 2026-02-08
modified: 2026-02-08
---

# sync.test.ts — 19 tests

**Source**: `scripts/sync/__tests__/sync.test.ts`
**Module under test**: `scripts/sync/index.ts` (path helpers, source tree, category list); `runSync` is interactive and not unit tested.

Tests sync layout detection, **source tree** (repo root vs `coding-tools/<tool>/`), category list building, and the filter-by-ids contract. No tests run the interactive `runSync` flow (source pick, direction, delete-stale, syncDir).

## Covered

| Area | What's tested |
|------|----------------|
| `getToolsWithGlobalPaths` | Tools with at least one GLOBAL_* path; Cursor has GLOBAL_AGENTS, GLOBAL_COMMANDS |
| `expandTilde` | `~/` → home dir; non-`~/` unchanged |
| `buildSyncCategoryList` | All four categories for Cursor (canonical); excludes rules when useCursorDb; only non-empty global+repo; filter by selected ids |
| `findSyncSourceDirs` | Recursive scan for dirs containing rules/skills/agents/commands (max depth 5); returns relative paths |
| `buildSyncSourceTree` | Builds cascaded tree from found paths; single repo node when none found |
| `getCanonicalSyncRepoPaths` | rules, skills, agents, commands under repo root |
| `getToolSyncRepoPaths` | Tool schema paths; Cursor gets .cursor/agents, .cursor/commands |
| `hasCanonicalSyncLayout` | True when any of rules/, skills/, agents/, commands/ exist at repo root |

## Not covered

- `runSync`: source tree prompt (repo vs coding-tools/X), direction selection, delete-stale confirm, `syncDir` calls, cursor-db compose/write. Use manual or E2E testing.

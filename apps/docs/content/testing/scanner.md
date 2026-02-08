---
title: "scanner.test.ts"
created: 2026-02-08
modified: 2026-02-08
---

# scanner.test.ts — 7 tests

**Source**: `scripts/shared/__tests__/scanner.test.ts`
**Module under test**: `scripts/shared/scanner.ts`

Tests filesystem-based tool detection and the three-tier agents repo resolution strategy. All tests use real filesystem operations against temp directories.

## `detectTools` — 4 tests

Scans a directory for all 10 supported tools' rule files and directories.

| Test | Setup | Expected |
|------|-------|----------|
| detects cursor rules directory | `.cursor/rules/test.mdc` created | Source with `id: 'cursor'`, 1 rule named `"test"`, label matches `"Cursor (N file(s))"` |
| detects claude single file | `CLAUDE.md` created | Source with `id: 'claude'` |
| returns empty for no tool files | Empty directory | `[]` — no sources detected |
| skips _prefixed directories | `_drafts/draft.mdc` + `real.mdc` | Only `real.mdc` found; `_drafts/` ignored |

### Underscore prefix convention

The `_` prefix test validates an important convention: directories starting with `_` are treated as drafts or internal and excluded from scanning. This lets users keep work-in-progress rules in `_drafts/` without them being picked up by the composer.

## `resolveAgentsRepo` — 3 tests

The three-tier resolution strategy for finding the agents repo's bundled rules:

1. **Tier 1: Local** — `rules/` and `skills/` directories in CWD
2. **Tier 2: GitHub** — (not yet implemented in MVP)
3. **Tier 3: Bundled** — Relative to `import.meta.url` (package root)

| Test | Setup | Expected |
|------|-------|----------|
| finds local rules/ directory | `rules/approach.mdc` in temp dir | Source with `id: 'agents-repo'`, label contains `"local"` |
| finds local skills/ directory | `skills/my-skill/SKILL.md` in temp dir | Source includes a rule with `type: 'skill'` |
| falls back to bundled rules | Empty directory (no `rules/` or `skills/`) | Either bundled source or `null` |

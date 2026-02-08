---
title: "variants.test.ts"
created: 2026-02-08
modified: 2026-02-08
---

# variants.test.ts — 9 tests

**Source**: `scripts/compose/__tests__/variants.test.ts`
**Module under test**: `scripts/compose/variants.ts`

Tests the `coding-tools/` directory generation that creates pre-processed, tool-specific rule files for every supported tool. This is the most integration-heavy unit test file — it exercises placeholder resolution, frontmatter handling, extension mapping, and filesystem writes together.

## Test Fixtures

Creates a controlled set of source files in a temp directory:

| File | Type | Placeholders |
|------|------|-------------|
| `rules/approach.mdc` | Static rule | None — same content for all tools |
| `rules/tools.mdc` | Dynamic rule | `{{TOOL_NAME}}`, `{{RULES_DIR}}`, `{{SKILLS_DIR}}` |
| `skills/my-skill/SKILL.md` | Skill | None |

The dynamic rule has placeholders in both frontmatter and body, exercising every code path.

## Tests

### Generation basics — 3 tests

| Test | What it checks |
|------|---------------|
| generates directories for specified tools | `['cursor', 'claude']` → 2 results with correct `toolId` |
| creates correct files per tool | Cursor dir contains `approach.mdc`, `tools.mdc`, `README.md` with correct content |
| reports file counts | 2 rules + 1 skill = `fileCount: 3` |

### Placeholder resolution — 2 tests

| Test | Tool | What it checks |
|------|------|---------------|
| resolves placeholders for cursor | Cursor | `{{RULES_DIR}}` → `.cursor/rules/`, frontmatter `{{TOOL_NAME}}` → `Cursor` |
| resolves for claude + removes empty lines | Claude | `{{RULES_DIR}}` → `.claude/rules/`, `{{SKILLS_DIR}}` line removed |

### Format-specific behavior — 3 tests

| Test | What it checks |
|------|---------------|
| strips frontmatter for non-frontmatter tools | Claude `approach.md` has no `---` |
| preserves frontmatter for cursor | Cursor `approach.mdc` retains `---` and `description:` |
| uses correct extensions per tool | `.mdc` (Cursor), `.md` (Claude), `.instructions.md` (Copilot) |

### Cleanup — 1 test

| Test | What it checks |
|------|---------------|
| cleans output directory first | A pre-existing `stale.mdc` is removed before regeneration |

---
title: Compose Command
created: 2026-02-08
modified: 2026-02-08
---

# Compose Command

Merges modular rule files into a single composed document for a target tool. The compose pipeline handles source discovery, interactive selection, placeholder resolution, optional LLM optimization, and output writing.

```bash
pnpm compose [path] [-o output]
# or
pnpm dev compose [path] [-o output]
```

The optional `[path]` argument can be a directory of rule files or a single rule file. When provided, auto-detection and source picking are skipped — the given path is used directly.

The optional `-o`/`--output` flag specifies where to write the result, skipping the interactive "Write to" prompt:

- **File path** (e.g., `-o AGENTS.md`) — writes a single composed file
- **Directory path** ending with `/` (e.g., `-o .cursor/rules/`) — writes individual rule files (mkdir -p as needed)

## Pipeline Steps

### 1. Detect Sources

Scans the current working directory for rule files from all 10 supported tools. Also resolves the agents repo (local `rules/` and `skills/` directories, or bundled fallback).

Each discovered source appears with a label like `Cursor (3 files)` or `agents-repo (local, 5 files)`.

**Skipped** when a `[path]` argument is provided.

### 2. Pick Sources

Interactive checkbox list where you select which sources to include. By default all are selected.

**Skipped** when a `[path]` argument is provided.

### 3. Select Rules (Tree Multiselect)

A custom tree prompt shows all discovered rules organized by source. You can expand/collapse sources and toggle individual rules:

```
◆ Select rules to include
│ [x] ▼ agents-repo (local, 5 files)
│   [x] approach        General approach to tasks
│   [x] coding-conventions   Use consistent patterns
│   [x] rules-and-skills    Cursor rules and skills conventions
│ [x] ▼ Cursor (2 files)
│   [x] my-project-rule     Project-specific conventions
```

**Keybindings:**

| Key                  | Action                                                                |
| -------------------- | --------------------------------------------------------------------- |
| `↑`/`↓` (or `k`/`j`) | Navigate visible items                                                |
| `←`                  | Collapse expanded group, or move cursor to parent group (cascades up) |
| `→`                  | Expand collapsed group                                                |
| `Space`              | Toggle selection (group = toggle all children)                        |
| `a`                  | Toggle all                                                            |
| `Enter`              | Confirm selection                                                     |

### 3.5. Reorder Sections (Optional)

When more than one rule is selected, the tool displays the current section order and asks if you want to reorder. If yes, enter a comma-separated list of new positions (e.g., `3,1,2,4`). The input is validated for correct count, valid indices, and no duplicates.

### 4. Pick Target Tool

Select which tool to resolve placeholders for. This determines how `{{RULES_DIR}}`, `{{TOOL_NAME}}`, etc. are replaced.

### 4.5. Numbering Toggle

Choose whether to add numbered prefixes to H2 section headings in the output (e.g., `## 1. Approach`, `## 2. Coding Conventions`). Defaults to yes. Already-numbered headings are skipped. Only H2 headings are numbered — H3+ are left untouched.

### 5. Compose

Rules are merged in order:

1. Strip YAML frontmatter from each rule's raw content
2. Count `{{placeholder}}` occurrences across all rules
3. Resolve placeholders for the target tool (see [Tool Registry](tool-registry))
4. Lines with empty-value placeholders are removed entirely
5. Increment all heading levels by one per-section (H1 → H2, H2 → H3, etc.) to avoid multiple H1s in the combined output. Controlled by `incrementHeadings` option (default `true`). H6 headings are left unchanged (cannot exceed H6).
6. Embed `> [!globs] patterns...` callouts after the first heading for scoped rules (`alwaysApply: false`). Rules with `alwaysApply: false` but no globs get an empty `> [!globs]` callout. Controlled by `embedGlobs` option (default `true`).
7. Join sections with double newlines
8. If numbering is enabled, add `N. ` prefixes to H2 headings via `addSectionNumbers()`

Output shows line count, token estimate, and placeholder count.

### 6. Optional LLM Optimization

If you choose to optimize, the composed document is sent to OpenRouter (Claude Sonnet by default) with a system prompt that instructs the LLM to:

- Deduplicate repeated instructions
- Tighten prose without losing meaning
- Preserve all technical specifics

A diff preview shows before/after with token savings. You can accept or reject the optimized version.

### 7. Format and Write

All output is formatted with [Prettier](https://prettier.io) before writing. The formatter uses the nearest `.prettierrc` config (walking up from the output file path). If Prettier is unavailable, content is written as-is.

Formatting applies to:

- Single-file output (e.g., `AGENTS.md`)
- Individual rule files in directory output
- All `coding-tools/` variant files

### 8. Pick Output Targets

Choose where to write the composed document:

- **Single file** — e.g., `AGENTS.md`, `CLAUDE.md`, `.cursorrules`
- **Directory** — individual rule files in a tool's format (e.g., `.cursor/rules/`)
- **Other (specify path)** — enter a custom file or directory path (paths ending with `/` are treated as directories)
- Multiple targets can be selected at once

**Skipped** when `--output`/`-o` is provided.

### 9. Write + Regenerate Variants

Writes to all selected targets, then regenerates the `coding-tools/` directory with pre-processed variants for all tools.

The command ends with a one-line summary:

- **Composed n rules** — number of rules merged
- **Created x files** — total files written (1 per single-file target, N per directory target)
- **y lines, ~z tokens** — total lines and OpenAI-style token count of written content (~ indicates model-specific)
- **Took t** — elapsed time (ms or s)

## Key Modules

| Module        | File                          | Purpose                                                                                                                                                                                                      |
| ------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Composer      | `scripts/compose/composer.ts` | `compose()` — merges rules, `incrementHeadings()` — bumps heading levels, `injectGlobAnnotation()` — embeds glob callouts, `addSectionNumbers()` — numbered headings, `estimateTokens()` — rough token count |
| Variants      | `scripts/compose/variants.ts` | `generateVariants()` — produces `coding-tools/<tool>/` directories                                                                                                                                           |
| System Prompt | `scripts/compose/prompt.md`   | Instructions for LLM optimization                                                                                                                                                                            |

## `coding-tools/` Directory

The variants generator creates a pre-processed directory for each tool:

```
coding-tools/
  cursor/
    approach.mdc          ← Frontmatter preserved, placeholders resolved
    coding-conventions.mdc
    README.md             ← Copy-to instructions
  claude/
    approach.md           ← Frontmatter stripped, placeholders resolved
    coding-conventions.md
    README.md
  copilot/
    approach.instructions.md   ← Tool-specific extension
    ...
```

Each tool directory contains:

- Rule files with the correct extension and frontmatter handling
- Placeholders resolved to tool-specific values
- Lines with empty-value placeholders removed
- A README with copy-to instructions

Regenerate manually:

```bash
pnpm build-variants
```

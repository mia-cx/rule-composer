---
title: Compose Command
created: 2026-02-08
modified: 2026-02-08
---

# Compose Command

Merges modular rule files into a single composed document for a target tool. The compose pipeline handles source discovery, interactive selection, placeholder resolution, optional LLM optimization, and output writing.

```bash
pnpm compose
# or
pnpm dev compose
```

## Pipeline Steps

### 1. Detect Sources

Scans the current working directory for rule files from all 10 supported tools. Also resolves the agents repo (local `rules/` and `skills/` directories, or bundled fallback).

Each discovered source appears with a label like `Cursor (3 files)` or `agents-repo (local, 5 files)`.

### 2. Pick Sources

Interactive checkbox list where you select which sources to include. By default all are selected.

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
5. Join sections with double newlines
6. If numbering is enabled, add `N. ` prefixes to H2 headings via `addSectionNumbers()`

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
- Both

### 9. Write + Regenerate Variants

Writes to all selected targets, then regenerates the `coding-tools/` directory with pre-processed variants for all tools.

## Key Modules

| Module | File | Purpose |
|--------|------|---------|
| Composer | `scripts/compose/composer.ts` | `compose()` — merges rules, `addSectionNumbers()` — numbered headings, `estimateTokens()` — rough token count |
| Variants | `scripts/compose/variants.ts` | `generateVariants()` — produces `coding-tools/<tool>/` directories |
| System Prompt | `scripts/compose/prompt.md` | Instructions for LLM optimization |

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

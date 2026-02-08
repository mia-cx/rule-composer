---
title: Decompose Command
created: 2026-02-08
modified: 2026-02-08
---

# Decompose Command

Splits a monolithic rules file (like `AGENTS.md` or `CLAUDE.md`) into modular individual rule files. Supports both heading-based (offline) and AI-assisted splitting strategies.

```bash
pnpm decompose
# or
pnpm dev decompose
```

## Pipeline Steps

### 1. Detect Input Files

Scans CWD for known single-file rule files:
`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules`, `.rules`, `CONVENTIONS.md`, `.github/copilot-instructions.md`, `.junie/guidelines.md`

### 2. Pick Input File

Select which file to decompose.

### 3. Choose Split Strategy

| Strategy | How it works | When to use |
|----------|-------------|-------------|
| **Heading-based** | Splits on `##` (H2) boundaries. H3+ stays with parent H2. No LLM needed. | Well-structured documents with clear H2 sections |
| **AI-assisted** | LLM analyzes the document and proposes logical rule groupings. Returns heading references (metadata-only), content is always copied from the source. | Poorly structured documents, or when you want smarter grouping |

### 4. Select Sections

A multiselect prompt shows all discovered sections. All are selected by default. Each option shows the section name (with directory if AI-assigned), description, and line count.

```
◆ Select sections to extract
│ [x] preamble                    These rules define conventions (3 lines)
│ [x] approach                    Plan first, confirm, then implement. (12 lines)
│ [x] coding-conventions          Use consistent patterns (28 lines)
│ [x] technology-preferences      (13 lines)
│ [x] communication               Be concise (10 lines)
```

### 4.5. Numbered File Prefix Toggle

Choose whether to add zero-padded numbered prefixes to output filenames (e.g., `01-approach.mdc`, `02-coding-conventions.mdc`). Defaults to yes. Array order determines numbering. The prefix is only applied to the filename — section headings in the content are not affected.

### 5. Detect and Replace Tool-Specific Paths

If the content contains tool-specific paths (e.g., `.cursor/rules/`), the tool detects the likely source tool using `detectSourceTool()` and shows which paths would be replaced with `{{PLACEHOLDER}}` syntax. You can confirm or skip this step.

### 6. Pick Output Format

Choose which tool format to write in. This determines file extension and whether frontmatter is generated.

### 7. Pick Output Directory

Defaults to the tool's standard rules directory (e.g., `.cursor/rules/` for Cursor).

### 8. Generate Frontmatter

For tools that support frontmatter (currently only Cursor with `.mdc`):
- **`alwaysApply: true`** is always included
- **`description`** is extracted from the first prose line of the section (truncated to 120 chars). If the section starts with a table or list, description is omitted.

Tools without frontmatter support get plain markdown.

### 9. Format Output

All output is formatted with [Prettier](https://prettier.io) before writing. The formatter resolves config from the nearest `.prettierrc` (walking up from the output directory). If Prettier is unavailable, content is written as-is.

### 10. Overwrite Confirmation

If any output files already exist (accounting for numbered prefixes when enabled), the tool lists them and asks for confirmation before overwriting.

### 11. Write Files

Files are written to the output directory with the correct extension. If numbered prefixes are enabled, files are named `01-name.ext`, `02-name.ext`, etc. If AI-assisted decomposition assigned a `directory` field, files are placed in subdirectories.

## Split Strategies in Detail

### Heading-Based (`splitByHeadings`)

File: `scripts/decompose/splitter.ts`

Deterministic, no external dependencies. Walks through lines and:

1. Collects content before the first `##` as "preamble" (if it contains meaningful content beyond just an H1)
2. Each `##` starts a new section
3. `###` and deeper headings stay with their parent `##`
4. Numbered prefixes (e.g., `## 1. Approach`) are stripped from both the filename and the content heading via `stripHeadingNumber()`
5. Heading text is converted to kebab-case for the filename
6. Description is extracted from the first non-heading line

### AI-Assisted (`aiDecompose`)

File: `scripts/decompose/index.ts`

Uses OpenRouter API with a metadata-only response format for token efficiency:

1. Sends the document to the LLM with a system prompt
2. LLM returns JSON array with `name`, `description`, `headings[]`, and optional `directory`
3. Response is validated against `decomposeResponseSchema` (Zod)
4. If validation fails, retries once with error feedback appended to the conversation
5. Content is reconstructed from the source document using heading references (`reconstructFromHeadings`)
6. Falls back to heading-based splitting if both LLM attempts fail

**Key design decision**: The LLM never generates content. It only provides metadata (which headings belong to which rule, and how to name/describe them). All content is copied verbatim from the source document via `parseHeadingMap` + `reconstructFromHeadings`.

## Key Modules

| Module | File | Purpose |
|--------|------|---------|
| Splitter | `scripts/decompose/splitter.ts` | `splitByHeadings()` — H2-boundary splitting, `stripHeadingNumber()` — removes `N. ` prefixes |
| Matcher | `scripts/decompose/matcher.ts` | `parseHeadingMap()`, `reconstructFromHeadings()` — AI metadata → content |
| Decompose helpers | `scripts/decompose/index.ts` | `extractProseDescription()`, `buildRawContent()` — frontmatter generation |
| System Prompt | `scripts/decompose/prompt.md` | Instructions for AI-assisted decomposition |

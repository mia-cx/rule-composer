---
title: Decompose Command
created: 2026-02-08
modified: 2026-02-08
---

# Decompose Command

Splits a monolithic rules file (like `AGENTS.md` or `CLAUDE.md`) into modular individual rule files. Supports both heading-based (offline) and AI-assisted splitting strategies.

```bash
pnpm decompose [path] [-o output-dir]
# or
pnpm dev decompose [path] [-o output-dir]
```

The optional `[path]` argument can be a file to decompose or a directory to scan for known rule files. When a file is provided, detection and file picking are skipped. When a directory is provided, it scans that directory instead of CWD.

The optional `-o`/`--output` flag specifies the output directory, skipping the interactive directory prompt.

## Pipeline Steps

### 1. Detect Input Files

Scans CWD for:

- **Single-file rule files:** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules`, `.rules`, `CONVENTIONS.md`, `.github/copilot-instructions.md`, `.junie/guidelines.md`
- **Agents and commands:** any `.md` files under `agents/`, `commands/`, `.cursor/agents/`, or `.cursor/commands/`

Also looks for the same in the **bundled** package root. Those appear as e.g. `Bundled: AGENTS.md` or `Bundled: agents/foo.md`.

**Skipped** when a file `[path]` argument is provided. When a directory is given, it scans that directory instead (same patterns).

### 2. Pick Input File

Select which file to decompose.

**Skipped** when a file `[path]` argument is provided.

### 3. Choose Split Strategy

| Strategy          | How it works                                                                                                                                         | When to use                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Heading-based** | Splits on `##` (H2) boundaries. H3+ stays with parent H2. No LLM needed.                                                                             | Well-structured documents with clear H2 sections               |
| **AI-assisted**   | LLM analyzes the document and proposes logical rule groupings. Returns heading references (metadata-only), content is always copied from the source. | Poorly structured documents, or when you want smarter grouping |

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

**Skipped** when `--output`/`-o` is provided.

### 8. Resolve Hash Links to Relative

Cross-references in the composed document use hash anchors (e.g. `[Rules](#6-rules-and-skills)`). Before writing each rule file, `resolveHashToRelative()` converts these to relative file links: `[Rules](./06-rules-and-skills.mdc)`. Section number N maps to the output filename for that section (e.g. `06-rules-and-skills.mdc` when numbered).

### 9. Extract Section Metadata and Generate Frontmatter

`extractSectionMetadata()` reads optional inline metadata at the start of each split and strips it from the body:

- **`> One-line summary.`** — Plain blockquote: used as frontmatter `description` (one or more lines, joined and truncated to 120 chars). Essential for subagents and skills that rely on `description`.
- **`> [!globs] pattern`** — Callout: glob patterns and `alwaysApply: false` in frontmatter (same as composed output).
- **`> [!alwaysApply] true` or `> [!alwaysApply] false`** — Callout: explicit `alwaysApply` in frontmatter.
- **`> [!type] skill` | `> [!type] agent` | `> [!type] command`** — Callout: section type so the split is written to `skills/`, `agents/`, or `commands/` (see step 12). Emitted by compose when merging skill/agent/command files into a monolith; if present, overrides the input file’s type for that section.

If no blockquote description is present, description falls back to the first prose line (as before). If no `[!globs]` is found, `alwaysApply` defaults to `true`. `unquoteGlobs()` reverses `quoteGlobs()` so Cursor sees native unquoted `globs:` values.

For tools that support frontmatter (currently only Cursor with `.mdc`), the extracted metadata is written as YAML frontmatter. Tools without frontmatter get plain markdown (metadata lines are still removed from the body).

### 10. Format Output

All output is formatted with [Prettier](https://prettier.io) before writing. The formatter resolves config from the nearest `.prettierrc` (walking up from the output directory). If Prettier is unavailable, content is written as-is.

### 11. Overwrite Confirmation

If any output files already exist (accounting for numbered prefixes when enabled), the tool lists them and asks for confirmation before overwriting.

### 12. Write Files

Files are written using a **canonical layout** derived from the output directory:

- **Rules** — in `rules/` (with optional numbered prefixes and optional `directory` subdirs from AI-assisted decomposition).
- **Skills** — in `skills/<name>/SKILL.md` (when the input was a skill file).
- **Agents** — in `agents/<name>.md` (when the input was an agent file).
- **Commands** — in `commands/<name>.md` (when the input was a command file).

When the output directory is a "rules" path (e.g. `.cursor/rules/`), the layout root is its parent (e.g. `.cursor/`), so agents and commands end up in `.cursor/agents/` and `.cursor/commands/`. Otherwise the output directory is the layout root and `rules/` is created under it.

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

| Module            | File                              | Purpose                                                                                                                             |
| ----------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Splitter          | `scripts/decompose/splitter.ts`   | `splitByHeadings()` — H2-boundary splitting, `stripHeadingNumber()` — removes `N. ` prefixes                                        |
| Matcher           | `scripts/decompose/matcher.ts`    | `parseHeadingMap()`, `reconstructFromHeadings()` — AI metadata → content                                                            |
| Decompose helpers | `scripts/decompose/index.ts`      | `extractProseDescription()`, `buildRawContent()` — frontmatter generation (with glob/alwaysApply support)                           |
| Link resolution   | `scripts/shared/link-resolution.ts` | `resolveHashToRelative()` — transforms `#N-slug` hash anchors to `./NN-slug.ext` relative links for decomposed modular output     |
| Section metadata  | `scripts/shared/formats.ts`       | `extractSectionMetadata()` — extracts blockquote description, `> [!globs]`, `> [!alwaysApply]`; `unquoteGlobs()` — reverses `quoteGlobs()` for Cursor output |
| System Prompt     | `scripts/decompose/prompt.md`   | Instructions for AI-assisted decomposition                                                                               |

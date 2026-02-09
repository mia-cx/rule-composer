This is **rule-composer**, a CLI tool for composing, converting, and optimizing AI coding agent rules across 10+ tools. It lives in a pnpm monorepo. The primary codebase is in `scripts/` (TypeScript, ESM, tsup build). Documentation is in `apps/docs/content/` (Quartz/Markdown).

## 1. Project Architecture

Two subcommands (`compose`, `decompose`) sharing modules in `scripts/shared/`.

```text
scripts/index.ts           → flag parser + subcommand router (compose [path] [-o out] | decompose [path] [-o out])
scripts/compose/index.ts   → orchestration: [input?] → scan → select → reorder → compose → optimize → [-o?] write → variants
scripts/decompose/index.ts → orchestration: [input?] → detect → pick → split → select → numbered → placeholder → format → [-o?] write
scripts/shared/            → types, schemas, formats, scanner, openrouter, cli, tree-prompt
```

Both subcommands accept an optional `[path]` argument (file or directory) that skips auto-detection, and `--output`/`-o` to skip the interactive output prompt. Paths ending with `/` are treated as directory targets.

### Key boundaries

- **Orchestration** (`compose/index.ts`, `decompose/index.ts`) — wires modules together, handles user interaction.
- **Pure logic** (`composer.ts`, `splitter.ts`, `matcher.ts`) — no I/O, no prompts, fully testable.
- **I/O adapters** (`formats.ts`: `readRule`, `writeAsSingleFile`, `writeAsDirectory`) — thin wrappers around `fs`. No formatting, no placeholder resolution.
- **Formatting** happens at the orchestration layer via `formatMarkdown()`, not inside write functions. This keeps unit tests unaffected.

### Section ordering & numbering

- **Compose**: `compose()` increments all heading levels by one per-section (H1 → H2, H2 → H3, etc.) by default to avoid multiple H1s in the combined output (`incrementHeadings` option, default `true`). Scoped rules (`alwaysApply: false`) get a `> [!globs] patterns...` callout injected after the first heading (`embedGlobs` option, default `true`). Sections that are skills, agents, or commands get a `> [!type] skill|agent|command` callout so that decomposing the monolith later restores them to the correct dirs. Users can also reorder selected rules (step 3.5) and add numbered prefixes to H2 headings via `addSectionNumbers()` (step 4.5). Both are optional toggles.
- **Decompose**: `extractSectionMetadata()` reads optional inline metadata at the start of each split: a plain blockquote for `description`, `> [!globs] pattern`, and `> [!alwaysApply] true|false`. These are stripped from the body and passed to `buildRawContent()`. If no blockquote description is present, description falls back to the first prose line. `unquoteGlobs()` reverses `quoteGlobs()` so Cursor sees native unquoted `globs:` values. `stripHeadingNumber()` removes `N. ` prefixes from H2 headings in both filename and content. `writeAsDirectory()` uses a single canonical layout: rules in `rulesDir` (with optional numbered prefixes and `rule.directory` subdirs), skills in `layoutRoot/skills/<name>/SKILL.md`, agents in `layoutRoot/agents/<name>.md`, commands in `layoutRoot/commands/<name>.md`. For skills, `readRule()` derives `name` from the parent directory (e.g. `skills/organize-commits/SKILL.md` → `organize-commits`), so the directory structure is preserved on read and write. Option `{ numbered: true }` prefixes rule filenames with zero-padded indices (`01-`, `02-`).

### Link resolution

- **Modular rules** use relative file links: `[Rules](./06-rules-and-skills.mdc)`.
- **Composed output** uses hash anchors: `[Rules](#6-rules-and-skills)`.
- **Compose**: `resolveRelativeToHash()` transforms `./NN-slug.ext` → `#N-slug` for intra-document links (section N = 1-based position). Controlled by `resolveLinks` option (default `true`).
- **Decompose**: `resolveHashToRelative()` transforms `#N-slug` → `./NN-slug.ext` using the output filename map (section N → `NN-name.ext`).

### Data flow

`RuleFile` is the core data type — everything reads into it and writes from it. `compose()` takes `RuleFile[]` and returns a string. `splitByHeadings()` returns `SplitResult[]` which the orchestrator converts to `RuleFile[]`.

### Conventions

- Keep interactive prompts in `cli.ts` or orchestration files, not in shared modules.
- Call `formatMarkdown` at the orchestration layer, not inside `writeAsSingleFile` / `writeAsDirectory`.

## 2. .mdc Frontmatter Conventions

> [!globs] \*_/_.mdc

Every `.mdc` rule file must have valid YAML frontmatter with these fields:

### Required fields

- `description` — One-line summary of what the rule covers
- `alwaysApply` — Explicit boolean. `true` for project-wide rules (no globs), `false` for scoped rules (with globs)

### Optional fields

- `globs` — File patterns that trigger the rule. Unquoted, never wrapped in `"..."` or `[...]`
  - Single: `globs: scripts/**/*.ts`
  - Multiple: `globs: scripts/shared/formats.ts, scripts/decompose/index.ts`

### Rules

- Every rule with `globs` must set `alwaysApply: false`
- Every rule without `globs` must set `alwaysApply: true`
- Glob values are always unquoted — quotes cause literal matching, not pattern matching
- Multiple globs use comma-separated values, not YAML arrays — `[...]` syntax does not parse correctly
- Glob patterns starting with `*` (e.g., `**/*.mdc`) are invalid YAML (`*` is a YAML alias character). Cursor handles them natively, but `gray-matter` will crash. The CLI pre-quotes these via `quoteGlobs()` before parsing.

### Inline section metadata (monolith only)

When authoring a monolithic AGENTS.md for later decompose, you can add optional metadata at the start of each H2 section so decomposed rules get correct frontmatter (important for subagents and skills that rely on `description`):

- **description** — Plain blockquote: `> One-line summary.` (one or more lines; stripped and used as frontmatter `description`, max 120 chars).
- **globs** — Callout: `> [!globs] pattern` (same as composed output).
- **alwaysApply** — Callout: `> [!alwaysApply] true` or `> [!alwaysApply] false`.

Decompose strips these lines from the body. Omit them for backward compatibility; description then falls back to the first prose line.

## 3. Tool Registry Pattern

> [!globs] scripts/shared/formats.ts

`TOOL_REGISTRY` and `TOOL_VARIABLES` in `scripts/shared/formats.ts` define all 10 supported tools.

### Adding a new tool

1. Add the ID to `TOOL_IDS` in `types.ts`
2. Add a `ToolConfig` entry in `TOOL_REGISTRY` (directories, singleFiles, extension, hasFrontmatter)
3. Add a variable map in `TOOL_VARIABLES` (TOOL_NAME, RULES_DIR, RULES_EXT, SKILLS_DIR, etc.)
4. Existing tests auto-cover via `TOOL_IDS` iteration — no test changes needed
5. Optionally add tool-specific tests for unusual variable combinations

### Key conventions

- `hasFrontmatter: true` — only Cursor (`.mdc`). All others are plain markdown.
- Empty string in `TOOL_VARIABLES` = feature not supported → lines referencing it are removed during resolution.
- `extension: ""` — tools like Zed/Aider that use a single file with no extension. Variants use `.md` fallback.
- `directories: []` — tools that only have single-file rules (no directory scanning).

### Do

- Keep variable maps exhaustive — every key present for every tool, even if empty string.
- Use the skill `/add-tool` for the full step-by-step workflow.

### Don't

- Don't add tool-specific logic in `composer.ts` or `splitter.ts` — resolution happens via the variable map.

## 4. Placeholder System

> [!globs] scripts/\*_/_.ts

Rules use `{{VARIABLE_NAME}}` syntax. `resolvePlaceholders(content, toolId)` handles resolution.

### Resolution rules

1. `{{VAR}}` with non-empty value → replaced with the value
2. `{{VAR}}` with empty string → **entire line removed** (not just the placeholder)
3. Unknown `{{VAR}}` → left as-is (passthrough)

### Line removal is critical

When a rule mentions `.cursor/skills/` and the target tool has no skills concept (empty value), the whole line disappears. This avoids broken references like "Use for skills." with no path.

If a line has mixed placeholders (one empty, one non-empty), the line is **still removed** — any empty var kills the line.

### Identifying dynamic rules

`readRule()` sets `hasPlaceholders: true` when `\{\{\w+\}\}` is found in the body. The CLI uses this to show which rules are dynamic vs static.

### Available variables

`TOOL_NAME`, `RULES_DIR`, `RULES_EXT`, `SKILLS_DIR`, `SKILLS_EXT`, `AGENTS_DIR`, `COMMANDS_DIR`, `GLOBAL_RULES`, `GLOBAL_SKILLS`, `GLOBAL_AGENTS`, `GLOBAL_COMMANDS`, `RULE_EXAMPLE`

Project-level dirs: `RULES_DIR`, `SKILLS_DIR`, `AGENTS_DIR`, `COMMANDS_DIR` (e.g. Cursor: `.cursor/rules/`, `.cursor/skills/`, `.cursor/agents/`, `.cursor/commands/`). Global dirs: `GLOBAL_*`. For tools without agents/commands, `AGENTS_DIR` and `COMMANDS_DIR` are empty and lines using them are removed when resolving.

See `TOOL_VARIABLES` in `scripts/shared/formats.ts` for the full per-tool map.

## 5. Placeholder Detection (Reverse Resolution)

> [!globs] scripts/shared/formats.ts, scripts/decompose/index.ts

`detectSourceTool` and `replaceWithPlaceholders` are the reverse of `resolvePlaceholders`.

### How detection works

`detectSourceTool(content)` checks only strong signal keys (`RULES_DIR`, `SKILLS_DIR`, `GLOBAL_RULES`, `GLOBAL_SKILLS`, `RULE_EXAMPLE`) — never short/generic values. Scores each tool by total matched value length. Highest score wins.

### How replacement works

`replaceWithPlaceholders(content, toolId)` replaces concrete values with `{{VAR}}` syntax:

1. Collects all non-empty variable values for the tool with length >= 4 (skips `.md`)
2. Sorts by value length descending (longest first)
3. Replaces globally, returns the count per variable

Longest-first prevents `RULE_EXAMPLE` (`.cursor/rules/my-convention.mdc`) from being partially matched by `RULES_DIR` (`.cursor/rules/`).

### CLI integration

In `decompose/index.ts`, step 5 (between section selection and output format):

1. Combine all split content, run `detectSourceTool`
2. If a tool is detected, dry-run `replaceWithPlaceholders` for a preview
3. Show the user what would change (value → placeholder, count)
4. If confirmed, apply replacements to each split individually

### Do

- Always replace per-split (not on combined content) to keep split boundaries intact
- Show a preview before applying — the user may not want all replacements

## 6. Formatting Pipeline

> [!globs] scripts/\*_/_.ts

Generated files are formatted with Prettier before writing. Formatting happens at the **orchestration layer**, not in the write functions.

### Integration points

- `compose/index.ts` — formats `finalContent` and each rule's `body`/`rawContent` before writing
- `decompose/index.ts` — formats each `RuleFile`'s `body`/`rawContent` before `writeAsDirectory`
- `compose/variants.ts` — formats each file before `writeFile` (controlled by `format` param)

### `formatMarkdown(content, filepath?)`

Exported from `scripts/shared/formats.ts`. Uses Prettier's Node API with dynamic import. Resolves config from the nearest `.prettierrc` via `prettier.resolveConfig(filepath)`. Returns content unchanged if Prettier is unavailable.

### Why not in write functions

- `writeAsSingleFile` and `writeAsDirectory` are dumb I/O — tested directly in unit tests
- If formatting happened inside them, every unit test would need Prettier or `format: false`
- Integration tests go through `writeAsDirectory` directly (not orchestration), so golden files stay unformatted and tests pass without Prettier involvement

### Do

- Pass `format: false` in `variants.test.ts` to skip Prettier overhead in tests
- Regenerate golden fixtures (`pnpm generate-fixtures`) if formatting defaults change

## 7. Decompose AI Design

> [!globs] scripts/decompose/\*_/_.ts

The LLM never generates rule content. It only provides metadata.

### How it works

1. LLM receives the full document + system prompt
2. LLM returns JSON: `[{ name, description, headings[], directory? }]`
3. `headings` are exact H2 text references (or `__preamble__` for pre-H2 content)
4. `reconstructFromHeadings()` copies content verbatim from the source document
5. Validated with `decomposeResponseSchema` (Zod)

### Why metadata-only

- **Token efficiency** — LLM output is small (names + heading refs), not full content
- **Content integrity** — source content is never rewritten, summarized, or altered by the LLM
- **Simpler validation** — heading references are easy to verify against the source

### Retry logic

2-attempt retry. On validation failure, the error message is appended to the conversation so the LLM can self-correct. Falls back to `splitByHeadings()` if both attempts fail.

### Do

- Always reconstruct from source via `parseHeadingMap` + `reconstructFromHeadings`
- Surface warnings for unmatched headings and unclaimed sections

### Don't

- Never use LLM-generated content as rule body text
- Never skip the Zod validation step

## 8. Testing Conventions

> [!globs] scripts/**/**tests**/**/\*.test.ts

161 tests across 10 files. Vitest. ESM imports with `.js` extension.

### Patterns

**Factory functions** — `makeRule()`, `makeSource()` create test data with sensible defaults. Override only what matters for the test.

**Temp directories** — All filesystem tests use `join(tmpdir(), 'arc-test-<name>')` with `beforeAll`/`afterAll` cleanup. Unique prefix per describe block to avoid parallel collisions.

**No mocking** — Real filesystem operations against temp dirs. Higher confidence, ~1s total runtime.

**Golden fixtures** — Integration tests compare against pre-generated files in `scripts/shared/__tests__/fixtures/`. Regenerate with `pnpm generate-fixtures` after changing core logic.

### Do

- One `describe` per export, one `it` per behavior.
- Consolidate trivially similar tests into one (parameterized or sequential assertions).
- `variants.test.ts`: pass `format: false` as 5th arg to skip Prettier in tests.

### Don't

- Don't mock `fs` — use real temp directories.
- Don't test interactive prompts or HTTP calls — those are intentionally untested orchestration.
- Don't forget to regenerate fixtures after changing `splitByHeadings`, `compose`, or `writeAsDirectory`.

## 9. Docs App

> [!globs] apps/docs/\*\*

- Uses **Quartz** (Preact-based), requires Node >=22 — treat as a standalone Preact project, not Svelte.
- Content is authored in Obsidian and published via Quartz.
- Use GitHub-flavored markdown links (`[text](path)`) instead of wikilinks for cross-compatibility.
- Frontmatter fields: `title`, `authors`, `created`, `modified`.

## 10. Sync Command and Coding-Tools Layout

> [!globs] scripts/sync/** scripts/compose/variants.ts coding-tools/**

### Sync command

Use `pnpm sync push|pull|diff` (or `tsx scripts/index.ts sync`) to sync repo rules, skills, agents, and (for Cursor) commands with the active tool’s global config. Categories: **rules**, **skills**, **agents**, **commands** (Cursor only: `.cursor/commands/` ↔ `~/.cursor/commands/`). A tree prompt lets you pick the **source** (repo root or `coding-tools/<tool>/`); `--yes` uses repo root. All categories for the chosen source are synced. If the repo has a canonical layout (`rules/`, `skills/`, `agents/`, `commands/` at root), the CLI asks whether to use it; else it uses the tool’s schema (e.g. `.cursor/rules/` for Cursor). For push/pull you are asked: **“Do you want to delete stale items (items at the destination that are not present in the source)?”** Default no. `--yes` skips all confirmations (including delete-stale and layout prompt).

- **push** — repo → global
- **pull** — global → repo
- **diff** — show differences only (no writes)

Options: `--repo <path>`, `--tool <id>`, `--yes` (skip confirmations, including delete-stale), `--cursor-db` (Cursor only, see below). Default tool is `cursor`; only tools with at least one of `GLOBAL_RULES`, `GLOBAL_SKILLS`, `GLOBAL_AGENTS`, or `GLOBAL_COMMANDS` in `TOOL_VARIABLES` are valid.

Implementation: `scripts/sync/index.ts` uses Node fs (`scripts/sync/sync-dir.ts`: recursive copy + optional delete-stale). Rules with `--cursor-db` use the cursor-db path (no syncDir). The `sync-agent-config` skill is a pointer to this CLI — do not duplicate sync instructions in the skill.

#### Cursor User Rules (--cursor-db)

Cursor’s **User Rules** (Settings → Rules for AI) are stored in SQLite, not in `~/.cursor/rules/`. Key: `aicontext.personalContext` in `ItemTable` of `state.vscdb` (paths: macOS `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`, Linux `~/.config/Cursor/User/globalStorage/state.vscdb`, Windows `%APPDATA%\Cursor\User\globalStorage\state.vscdb`). With `--cursor-db`, sync **push** composes repo `rules/` into one blob and writes to the DB; **pull** reads from the DB and writes `rules/cursor-user-rules.md`; **diff** compares composed repo content to DB content. Implementation: `scripts/sync/cursor-db.ts` (better-sqlite3). Close Cursor before writing to the DB. **If rules don’t show in Settings:** run `pnpm sync inspect --cursor-db` to list ItemTable keys and confirm our key is present; in many Cursor versions User Rules are synced to the cloud and the Settings UI may not read the local DB, so local writes might not appear.

### Coding-tools variant layout

Generated output under `coding-tools/<toolId>/`:

- **Rules**: `coding-tools/<toolId>/rules/` — one file per rule, tool-specific extension (e.g. `.mdc`, `.md`, `.instructions.md`).
- **Skills**: `coding-tools/<toolId>/skills/<skill-name>/SKILL.md` — preserve directory structure; always `SKILL.md` (no tool-specific extension for skills).
- **README**: `coding-tools/<toolId>/README.md` — instructs copying `rules/` and `skills/` into the project’s tool config.

Do not flatten skills to `skill-name-SKILL.mdc`; keep the `skill-name/SKILL.md` layout per Cursor’s Agent Skills convention.

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

- **Compose**: Rules are composed in order of their filename prefix (01-, 02-, …, 99-), so e.g. `99-rule-name.mdc` appears last in the monolith. Section numbers in the output are always sequential (1., 2., 3., …) by position—`addSectionNumbers()` strips any existing `N.` from H2 text and assigns numbers by order, not from the filename. `compose()` increments all heading levels by one per-section (H1 → H2, H2 → H3, etc.) by default (`incrementHeadings` option, default `true`). Scoped rules get a `> [!globs] patterns...` callout after the first heading (`embedGlobs` option, default `true`). Users can reorder selected rules (step 3.5) and toggle numbered H2 prefixes (step 4.5).
- **Decompose**: `extractGlobAnnotation()` detects `> [!globs]` callouts in split content and extracts the glob patterns and `alwaysApply: false` flag back into frontmatter via `buildRawContent()`. `unquoteGlobs()` reverses `quoteGlobs()` so Cursor sees native unquoted `globs:` values. `stripHeadingNumber()` removes `N. ` prefixes from H2 headings in both filename and content. `writeAsDirectory({ numbered: true })` prefixes filenames with zero-padded indices (`01-`, `02-`).

### Data flow

`RuleFile` is the core data type — everything reads into it and writes from it. `compose()` takes `RuleFile[]` and returns a string. `splitByHeadings()` returns `SplitResult[]` which the orchestrator converts to `RuleFile[]`.

### Conventions

- Keep interactive prompts in `cli.ts` or orchestration files, not in shared modules.
- Call `formatMarkdown` at the orchestration layer, not inside `writeAsSingleFile` / `writeAsDirectory`.
- Linting: ESLint (flat config in `eslint.config.js`). @eslint/markdown for `.md`/`.mdc`, typescript-eslint for `scripts/`. Run `pnpm lint`.

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

`TOOL_NAME`, `RULES_DIR`, `RULES_EXT`, `SKILLS_DIR`, `SKILLS_EXT`, `GLOBAL_RULES`, `GLOBAL_SKILLS`, `RULE_EXAMPLE`

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

Generated files are formatted with Prettier before writing. Formatting happens at the **orchestration layer**, not in the write functions. A **blank line between YAML frontmatter and body** is enforced by `ensureBlankLineAfterFrontmatter()` in `buildRawContent` (decompose) and `writeAsDirectory` (formats), so output always matches markdown convention and @eslint/markdown expectations.

### Integration points

- `compose/index.ts` — formats `finalContent` and each rule's `body`/`rawContent` before writing
- `decompose/index.ts` — formats each `RuleFile`'s `body`/`rawContent` before `writeAsDirectory`
- `compose/variants.ts` — formats each file before `writeFile` (controlled by `format` param)

### `formatMarkdown(content, filepath?)`

Exported from `scripts/shared/formats.ts`. Uses Prettier's Node API with dynamic import. Resolves config from the nearest Prettier config (e.g. `prettier.config.js`) via `prettier.resolveConfig(filepath)`. Returns content unchanged if Prettier is unavailable.

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

174 tests across 12 files. Vitest. ESM imports with `.js` extension.

### Patterns

**Factory functions** — `makeRule()`, `makeSource()` create test data with sensible defaults. Override only what matters for the test.

**Temp directories** — All filesystem tests use `join(tmpdir(), 'arc-test-<name>')` with `beforeAll`/`afterAll` cleanup. Unique prefix per describe block to avoid parallel collisions.

**No mocking** — Real filesystem operations against temp dirs. Higher confidence, ~1s total runtime.

**Golden fixtures** — Integration tests compare against pre-generated files in `scripts/shared/__tests__/fixtures/`. Regenerate with `pnpm generate-fixtures` after changing core logic.

### Do

- One `describe` per export, one `it` per behavior.
- Prefer one test with multiple cases (`it.each` or sequential assertions) over many trivially similar tests.
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

## 10. Finding npm Packages

When you need to find or choose npm packages (names, APIs, usage), use the registry search instead of web search. It is more token-efficient and returns package metadata directly.

**Do:**

- Run `pnpm search <term>` or `npm search <term>` to search the registry.
- Use `pnpm info <pkg>` / `npm view <pkg>` for a specific package’s readme, versions, and exports.

**Don’t:**

- Use web search as the first step for “npm package for X” or “how to use package Y on npm”.

**Reference:** [npm search](https://docs.npmjs.com/cli/v8/commands/npm-search) — search the registry; supports regex with a leading `/`.

# rule-composer

Write AI coding agent rules once, generate tool-specific variants for 10 supported tools.

Rules use `{{placeholders}}` like `{{RULES_DIR}}` and `{{TOOL_NAME}}` that resolve to the correct paths and values for each tool. Lines referencing placeholders that resolve to empty (e.g., `{{SKILLS_DIR}}` for tools without a skills concept) are removed automatically.

**Supported tools:** Cursor, Claude Code, GitHub Copilot, Windsurf, Cline, Zed, JetBrains, Amazon Q, Gemini Code Assist, Aider.

## Quick Start

Run directly in any project without installing — scans for rules in the current directory. When you have no local rules (e.g. a fresh project), the package’s **bundled** rules are still available as a source so you can compose or decompose from them:

```bash
# Interactive — pick compose or decompose
pnpm dlx rule-composer

# Compose: merge rules into a single document
pnpm dlx rule-composer compose [path] [-o output]

# Decompose: split a monolithic rules file into modular rules
pnpm dlx rule-composer decompose [path] [-o output-dir]

# Sync: push/pull/diff repo rules/ and skills/ with global config (e.g. ~/.cursor/)
pnpm dlx rule-composer sync [push|pull|diff] [--repo path] [--tool id] [--yes]
```

The optional `[path]` argument lets you skip auto-detection:

- **compose** — pass a directory of rule files (e.g., `.cursor/rules/`) or a single file
- **decompose** — pass the file to split (e.g., `AGENTS.md`) or a directory to scan

The optional `-o`/`--output` flag skips the interactive output prompt:

- **compose** — file path (e.g., `-o AGENTS.md`) or directory ending with `/` (e.g., `-o .cursor/rules/`)
- **decompose** — output directory (e.g., `-o .cursor/rules/`)

For LLM features, pass your API key as an environment variable:

```bash
OPENROUTER_API_KEY=sk-... pnpm dlx rule-composer compose
```

## Local Development

If you're working on this repo directly:

```bash
pnpm install

# Copy .env for LLM features (optional)
cp .env.example .env

# Run via dev scripts
pnpm dev            # Interactive
pnpm compose [path] [-o output]     # Compose command
pnpm decompose [path] [-o output]   # Decompose command
pnpm sync [push|pull|diff]          # Sync rules/skills with global config
pnpm build-variants                 # Regenerate coding-tools/
pnpm lint                           # ESLint: @eslint/markdown for .md/.mdc, typescript-eslint for scripts/
```

Linting uses ESLint (flat config): **@eslint/markdown** for Markdown and **typescript-eslint** for `scripts/**/*.ts`. Run `pnpm lint` before committing.

## Commands

### Compose

Scans your project for rule files across all supported tools (and the package’s **bundled** rules when present), lets you select which rules to include via an interactive tree prompt, resolves placeholders for your target tool, optionally optimizes via LLM, and writes the output.

```bash
pnpm dlx rule-composer compose
```

### Decompose

Detects monolithic rule files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, etc.) in the current directory and in the **bundled** package; any found in the package appear as e.g. `Bundled: AGENTS.md`. Splits the chosen file into individual rules using heading-based or AI-assisted strategies, generates frontmatter where supported, and writes modular files.

```bash
pnpm dlx rule-composer decompose
```

### Sync

Syncs the repo’s `rules/` and `skills/` with the active tool’s global config (e.g. `~/.cursor/rules/`, `~/.cursor/skills/`). Use **push** (repo → global), **pull** (global → repo), or **diff** (show differences only). Options: `--repo <path>`, `--tool <id>`, `--yes` to skip confirmation. For Cursor, `--cursor-db` syncs rules to/from the **User Rules** SQLite DB (Settings → Rules for AI) instead of `~/.cursor/rules/`.

**Note:** Cursor has no public API for User Rules; only the local `state.vscdb` is scriptable, and the Settings UI may read from the cloud. For reliable, version-controlled rules, use project rules (`.cursor/rules/`) or AGENTS.md.

```bash
pnpm sync push
pnpm sync pull --yes
pnpm sync diff
```

## Scripts

| Script                         | Description                                   |
| ------------------------------ | --------------------------------------------- |
| `pnpm dev`                     | Run interactively (pick compose or decompose) |
| `pnpm compose [path]`          | Compose rules for a target tool               |
| `pnpm decompose [path]`        | Decompose a monolithic rules file             |
| `pnpm sync` (push, pull, diff) | Sync rules/skills with global config          |
| `pnpm build`                   | Build for distribution (tsup)                 |
| `pnpm build-variants`          | Regenerate `coding-tools/` directories        |

The published npm package only includes `dist/`, `rules/`, `skills/`, `coding-tools/`, and the compose/decompose prompt files (see `files` in package.json). The test suite and source `.ts` files are not published.
| `pnpm test`                    | Run all tests                                 |
| `pnpm test:watch`              | Run tests in watch mode                       |
| `pnpm format`                  | Format codebase with Prettier                 |
| `pnpm generate-fixtures`       | Regenerate golden test fixtures               |

## Environment Variables

| Variable             | Required              | Description                                                                                                |
| -------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY` | For LLM features only | API key for [OpenRouter](https://openrouter.ai) — used for rule optimization and AI-assisted decomposition |

The tool works fully without an API key. LLM features are always optional.

> [!TODO] I have NOT tested the openrouter implementation (yet).

## Documentation

Full documentation is available in two places:

**Local** (Quartz markdown source):

- [Overview](apps/docs/content/index.md)
- [Compose Command](apps/docs/content/compose.md)
- [Decompose Command](apps/docs/content/decompose.md)
- [Sync Command](apps/docs/content/sync.md) — push/pull/diff rules and skills with global config
- [Tool Registry](apps/docs/content/tool-registry.md) — supported tools, placeholders, variable maps, coding-tools layout
- [Testing](apps/docs/content/testing/index.md) — test suite across 15 files

**Online** (deployed):

<!-- TODO: fill in URL after deploying docs -->

- [Documentation](https://example.com) — _URL pending deployment_

## Project Structure

```text
rules/                 Source rules with {{placeholders}}
skills/                Source skills with {{placeholders}}
coding-tools/          Generated tool-specific variants: <toolId>/rules/, <toolId>/skills/<skill-name>/SKILL.md (do not edit)
scripts/
  index.ts             CLI entry point
  compose/             Compose command (composer, variants, LLM prompt)
  decompose/           Decompose command (splitter, matcher, LLM prompt)
  shared/              Shared modules (formats, schemas, scanner, types, CLI)
apps/
  docs/                Documentation site (Quartz)
```

## Known Gotchas

**Cursor `.mdc` globs vs YAML parsing**: Cursor requires `globs` values to be unquoted (quoted values become literal matches), but glob patterns starting with `*` (e.g., `**/*.mdc`) are invalid YAML — `*` is a YAML alias character. The CLI pre-quotes these via `quoteGlobs()` before parsing with `gray-matter`. See [Tool Registry docs](apps/docs/content/tool-registry.md#frontmatter-parsing-globs-and-yaml) for details.

## Roadmap

### CLI Enhancements

- [ ] Test Openrouter implementation
- [ ] `--version`, `--help` flags
- [ ] `--non-interactive` mode with `--rules`, `--tool`, `--output` flags for CI/scripting
- [x] `[path]` positional argument for both compose and decompose
- [ ] Publish to npm registry (currently local-only)

### Compose Improvements

- [ ] CI check or pre-commit hook to verify `coding-tools/` is not stale (compare against source `rules/` timestamps)
- [ ] Decompose: rename, merge, or drop proposed rules in the preview step

### Ecosystem Integrations

Explore interop with existing agent rules tooling:

- [ ] [`@agentrules/cli`](https://www.npmjs.com/package/@agentrules/cli) — Agent rules CLI
- [ ] [`@clipboard-health/ai-rules`](https://www.npmjs.com/package/@clipboard-health/ai-rules) — AI rules framework
- [ ] [`ai-rules-sync`](https://www.npmjs.com/package/ai-rules-sync) — Rule syncing
- [ ] [`agent-rules-kit`](https://www.npmjs.com/package/agent-rules-kit) — Agent rules toolkit
- [ ] [`@quanvo99/ai-rules`](https://www.npmjs.com/package/@quanvo99/ai-rules) — AI rules package

Potential integrations: import rules from these formats, export to them, or use as rule sources alongside the three-tier resolution.

### Agents Repo Resolution

- [x] **Bundled source** — Compose and decompose include the package’s own `rules/` and `skills/` as a selectable source (useful for `pnpm dlx` when no local rules exist)
- [ ] Tier 2: GitHub fetch — pull rules from a remote agents repo when no local `rules/` directory exists

## License

MIT

# rule-composer

Write AI coding agent rules once, generate tool-specific variants for 10 supported tools.

Rules use `{{placeholders}}` like `{{RULES_DIR}}` and `{{TOOL_NAME}}` that resolve to the correct paths and values for each tool. Lines referencing placeholders that resolve to empty (e.g., `{{SKILLS_DIR}}` for tools without a skills concept) are removed automatically.

**Supported tools:** Cursor, Claude Code, GitHub Copilot, Windsurf, Cline, Zed, JetBrains, Amazon Q, Gemini Code Assist, Aider.

## Quick Start

Run directly in any project without installing — scans for rules in the current directory:

```bash
# Interactive — pick compose or decompose
pnpm dlx rule-composer

# Compose: merge rules into a single document
pnpm dlx composer compose

# Decompose: split a monolithic rules file into modular rules
pnpm dlx rule-composer decompose
```

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
pnpm compose        # Compose command
pnpm decompose      # Decompose command
pnpm build-variants # Regenerate coding-tools/
```

## Commands

### Compose

Scans your project for rule files across all supported tools, lets you select which rules to include via an interactive tree prompt, resolves placeholders for your target tool, optionally optimizes via LLM, and writes the output.

```bash
pnpm dlx rule-composer compose
```

### Decompose

Detects monolithic rule files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, etc.), splits them into individual rules using heading-based or AI-assisted strategies, generates frontmatter where supported, and writes modular files.

```bash
pnpm dlx rule-composer decompose
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Run interactively (pick compose or decompose) |
| `pnpm compose` | Compose rules for a target tool |
| `pnpm decompose` | Decompose a monolithic rules file |
| `pnpm build` | Build for distribution (tsup) |
| `pnpm build-variants` | Regenerate `coding-tools/` directories |
| `pnpm test` | Run all 132 tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm format` | Format codebase with Prettier |
| `pnpm generate-fixtures` | Regenerate golden test fixtures |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | For LLM features only | API key for [OpenRouter](https://openrouter.ai) — used for rule optimization and AI-assisted decomposition |

The tool works fully without an API key. LLM features are always optional.

## Documentation

Full documentation is available in two places:

**Local** (Quartz markdown source):

- [Overview](apps/docs/content/index.md)
- [Compose Command](apps/docs/content/compose.md)
- [Decompose Command](apps/docs/content/decompose.md)
- [Tool Registry](apps/docs/content/tool-registry.md) — supported tools, placeholders, variable maps
- [Testing](apps/docs/content/testing/index.md) — 132-test suite across 10 files

**Online** (deployed):

<!-- TODO: fill in URL after deploying docs -->
- [Documentation](https://example.com) — _URL pending deployment_

## Project Structure

```
rules/                 Source rules with {{placeholders}}
skills/                Source skills with {{placeholders}}
coding-tools/          Generated tool-specific variants (do not edit)
scripts/
  index.ts             CLI entry point
  compose/             Compose command (composer, variants, LLM prompt)
  decompose/           Decompose command (splitter, matcher, LLM prompt)
  shared/              Shared modules (formats, schemas, scanner, types, CLI)
apps/
  docs/                Documentation site (Quartz)
```

## Roadmap

### CLI Enhancements

- [ ] `--version`, `--help` flags
- [ ] `--non-interactive` mode with `--rules`, `--tool`, `--output` flags for CI/scripting
- [ ] `--input <path>` flag for decompose (currently interactive-only)
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

- [ ] Tier 2: GitHub fetch — pull rules from a remote agents repo when no local `rules/` directory exists (currently falls back directly to bundled)

## License

MIT

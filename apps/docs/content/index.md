---
title: agent-rule-composer
created: 2026-02-08
modified: 2026-02-08
---

# agent-rule-composer

A CLI tool for composing, converting, and optimizing AI coding agent rules across 10 supported tools. Write rules once using `{{placeholders}}`, then generate tool-specific variants for Cursor, Claude Code, GitHub Copilot, Windsurf, Cline, Zed, JetBrains, Amazon Q, Gemini, and Aider.

## Core Concepts

### Placeholder Templates

Rules are authored with tool-agnostic placeholders like `{{RULES_DIR}}`, `{{TOOL_NAME}}`, and `{{SKILLS_DIR}}`. When composing for a target tool, these resolve to the correct values. Lines referencing a placeholder that resolves to empty string (e.g., `{{SKILLS_DIR}}` for Claude, which has no skills concept) are removed entirely.

See [Tool Registry](tool-registry) for the full list of placeholders and their per-tool values.

### Two Commands

| Command | What it does |
|---------|-------------|
| [compose](compose) | Merges modular rules into a single document for a target tool, with optional LLM optimization |
| [decompose](decompose) | Splits a monolithic rules file into modular individual rules |

## Architecture

```
scripts/
  index.ts                 ← CLI entry point + subcommand router
  compose/
    index.ts               ← Compose orchestration
    composer.ts            ← Rule merging + token estimation
    variants.ts            ← coding-tools/ generation
    prompt.md              ← System prompt for LLM optimization
  decompose/
    index.ts               ← Decompose orchestration
    splitter.ts            ← Heading-based markdown splitting
    matcher.ts             ← AI metadata → source content reconstruction
    prompt.md              ← System prompt for AI-assisted decompose
  shared/
    types.ts               ← TypeScript types (ToolId, RuleFile, TreeNode, etc.)
    schemas.ts             ← Zod schemas for data validation
    formats.ts             ← Tool registry, placeholder resolution, file I/O
    scanner.ts             ← Filesystem tool detection + agents repo resolution
    openrouter.ts          ← OpenRouter LLM API client
    cli.ts                 ← Interactive prompts (@clack/prompts)
    tree-prompt.ts         ← Custom tree multiselect prompt
```

### Data Flow

**Compose**: Scan CWD → discover rule sources → interactive selection → merge rules → resolve placeholders → optional LLM optimization → write output.

**Decompose**: Detect monolithic rule files → pick input → split (heading-based or AI-assisted) → select sections → pick output format → generate frontmatter → write individual files.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run interactively
pnpm dev

# Or run a specific command
pnpm compose
pnpm decompose

# Run tests
pnpm test
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | For LLM features | API key for OpenRouter (used for optimization and AI-assisted decomposition) |

Copy `.env.example` to `.env` and fill in your key if you want to use LLM features. The tool works fully without it — LLM optimization is always optional.

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@clack/prompts` | Beautiful interactive CLI prompts |
| `gray-matter` | Parse and stringify YAML frontmatter |
| `zod` | Runtime schema validation for API responses and LLM output |
| `picocolors` | Terminal color output |
| `tsx` | TypeScript execution for development |
| `tsup` | Build for distribution |
| `vitest` | Test runner |

## Further Reading

- [Compose Command](compose) — Detailed compose workflow
- [Decompose Command](decompose) — Detailed decompose workflow
- [Tool Registry](tool-registry) — Supported tools, placeholders, and configuration
- [Testing](testing/) — 132-test suite documentation

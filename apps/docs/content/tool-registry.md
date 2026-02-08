---
title: Tool Registry
created: 2026-02-08
modified: 2026-02-08
---

# Tool Registry

agent-rule-composer supports 10 AI coding tools. Each tool has a configuration defining where it stores rules and a variable map for placeholder resolution.

## Supported Tools

| Tool               | ID             | Extension          | Frontmatter | Rules Directory         | Single File                       |
| ------------------ | -------------- | ------------------ | ----------- | ----------------------- | --------------------------------- |
| Cursor             | `cursor`       | `.mdc`             | Yes         | `.cursor/rules/`        | `.cursorrules`                    |
| Claude Code        | `claude`       | `.md`              | No          | `.claude/rules/`        | `CLAUDE.md`                       |
| GitHub Copilot     | `copilot`      | `.instructions.md` | No          | `.github/instructions/` | `.github/copilot-instructions.md` |
| Windsurf           | `windsurf`     | `.md`              | No          | `.windsurf/`            | `.windsurfrules`                  |
| Cline              | `cline`        | `.md`              | No          | `.clinerules/`          | —                                 |
| Zed                | `zed`          | —                  | No          | —                       | `.rules`                          |
| JetBrains          | `jetbrains-ai` | `.md`              | No          | `.aiassistant/rules/`   | `.junie/guidelines.md`            |
| Amazon Q           | `amazonq`      | `.md`              | No          | `.amazonq/rules/`       | —                                 |
| Gemini Code Assist | `gemini`       | `.md`              | No          | `.gemini/`              | `GEMINI.md`                       |
| Aider              | `aider`        | —                  | No          | —                       | `CONVENTIONS.md`                  |

**Notes:**

- Only Cursor uses YAML frontmatter (`.mdc` format with `description`, `alwaysApply`, `globs`).
- Zed and Aider are single-file only — they have no rules directory.
- When composing for a tool without a rules directory, directory-based output is not available.

### Frontmatter Parsing: `globs` and YAML

Cursor's `.mdc` frontmatter uses `globs` for file-pattern matching. These values must be **unquoted** for Cursor to interpret them as glob patterns (quoted values become literal string matches). However, glob patterns starting with `*` (e.g., `**/*.mdc`) are **invalid YAML** — the `*` character is a YAML alias indicator, and `js-yaml` (used by `gray-matter`) will throw a parse error.

The CLI handles this with `quoteGlobs()` — a pre-processing step that wraps `*`-prefixed glob values in quotes before passing frontmatter to `gray-matter`. This happens transparently in every code path that parses `.mdc` frontmatter (`readRule`, `compose`, `variants`). The quotes are only for YAML parsing; Cursor never sees them since compose strips frontmatter from output.

**Summary of `.mdc` `globs` constraints:**

| Constraint                                                    | Reason                                         |
| ------------------------------------------------------------- | ---------------------------------------------- |
| Values must be unquoted in the file                           | Cursor treats quoted values as literal strings |
| Multiple patterns use comma-separated values, not YAML arrays | Cursor's UI doesn't parse `[...]` array syntax |
| Patterns starting with `*` break `gray-matter`                | `*` is a YAML alias character                  |
| CLI pre-quotes `*` patterns before parsing                    | `quoteGlobs()` in `scripts/shared/formats.ts`  |

## Placeholders

Placeholders use `{{VARIABLE_NAME}}` syntax in rule content. During composition, they're resolved to tool-specific values.

### Available Variables

| Variable            | Description              | Example (Cursor)                  | Example (Claude)                 |
| ------------------- | ------------------------ | --------------------------------- | -------------------------------- |
| `{{TOOL_NAME}}`     | Human-readable tool name | `Cursor`                          | `Claude Code`                    |
| `{{RULES_DIR}}`     | Rules directory path     | `.cursor/rules/`                  | `.claude/rules/`                 |
| `{{RULES_EXT}}`     | Rule file extension      | `.mdc`                            | `.md`                            |
| `{{SKILLS_DIR}}`    | Skills directory path    | `.cursor/skills/`                 | _(empty)_                        |
| `{{SKILLS_EXT}}`    | Skill file extension     | `SKILL.md`                        | _(empty)_                        |
| `{{GLOBAL_RULES}}`  | Global rules directory   | `~/.cursor/rules/`                | `~/.claude/rules/`               |
| `{{GLOBAL_SKILLS}}` | Global skills directory  | `~/.cursor/skills/`               | _(empty)_                        |
| `{{RULE_EXAMPLE}}`  | Example rule file path   | `.cursor/rules/my-convention.mdc` | `.claude/rules/my-convention.md` |

### Resolution Rules

1. **Known placeholder with non-empty value** → replaced with the value
2. **Known placeholder with empty value** → the **entire line** is removed
3. **Unknown placeholder** → left as-is (passthrough)

The line-removal behavior is critical. When a rule mentions `{{SKILLS_DIR}}` and the target tool doesn't support skills (empty value), the entire line disappears instead of leaving a broken reference.

### Full Variable Map

```
                TOOL_NAME    RULES_DIR              SKILLS_DIR           GLOBAL_RULES           GLOBAL_SKILLS
cursor          Cursor       .cursor/rules/         .cursor/skills/      ~/.cursor/rules/       ~/.cursor/skills/
claude          Claude Code  .claude/rules/                              ~/.claude/rules/
copilot         GitHub Copilot .github/instructions/
windsurf        Windsurf     .windsurf/
cline           Cline        .clinerules/                                Documents/Cline/
zed             Zed
jetbrains-ai    JetBrains    .aiassistant/rules/    .junie/
amazonq         Amazon Q     .amazonq/rules/
gemini          Gemini CA    .gemini/
aider           Aider
```

_(Empty cells = empty string, meaning lines referencing those placeholders will be removed.)_

## Tool Configuration Type

```typescript
interface ToolConfig {
  id: ToolId
  name: string
  directories: string[] // Where the tool stores rule files
  singleFiles: string[] // Single-file rule locations
  extension: string // File extension for rule files
  hasFrontmatter: boolean // Whether the tool uses YAML frontmatter
}
```

## Detection

The scanner (`scripts/shared/scanner.ts`) checks for each tool in order:

1. Check all `directories` entries — if any exist with matching files, the tool is detected
2. Check all `singleFiles` entries — if any exist, the tool is detected
3. Files in directories starting with `_` (e.g., `_drafts/`) are skipped

## Adding a New Tool

1. Add the tool ID to the `TOOL_IDS` array in `scripts/shared/types.ts`
2. Add a `ToolConfig` entry in `TOOL_REGISTRY` in `scripts/shared/formats.ts`
3. Add a variable map in `TOOL_VARIABLES` in `scripts/shared/formats.ts`
4. Existing tests auto-cover the new tool via `TOOL_IDS` iteration
5. Add tool-specific placeholder tests if the tool has unusual variable combinations
6. Add the tool ID to a `generateVariants` call in `variants.test.ts`

## Coding-tools output

Running compose (or `pnpm build-variants`) generates tool-specific output under `coding-tools/<toolId>/`:

- **Rules**: `coding-tools/<toolId>/rules/` — one file per source rule, with the tool’s extension (e.g. `.mdc` for Cursor, `.md` for Claude, `.instructions.md` for Copilot).
- **Skills**: `coding-tools/<toolId>/skills/<skill-name>/SKILL.md` — directory structure is preserved; the skill filename is always `SKILL.md` (no tool-specific extension).
- **README**: `coding-tools/<toolId>/README.md` — instructs users to copy the `rules/` and `skills/` directories into their project’s tool config.

Copy the `rules/` and `skills/` directories from the desired tool folder into your project (e.g. `.cursor/rules/` and `.cursor/skills/` for Cursor).

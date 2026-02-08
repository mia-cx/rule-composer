---
title: "formats.test.ts"
created: 2026-02-08
modified: 2026-02-08
---

# formats.test.ts — 50 tests

**Source**: `scripts/shared/__tests__/formats.test.ts`
**Module under test**: `scripts/shared/formats.ts`

Tests the core tool registry, variable maps, placeholder resolution engine, and file I/O adapters. This is one of the largest test files because `formats.ts` is the foundation — every other module depends on it.

## `TOOL_REGISTRY` — 3 tests

Validates the static registry that defines how each of the 10 supported tools stores its rules.

| Test                             | What it checks                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| has an entry for every tool ID   | Iterates all `TOOL_IDS` and verifies each has a registry entry with matching `id` and a truthy `name` |
| cursor config has correct values | `.cursor/rules/` in `directories`, `.mdc` extension, `hasFrontmatter: true`                           |
| claude config has no frontmatter | `hasFrontmatter` is `false` — Claude rules are plain markdown                                         |

The first test is auto-expanding: when a new tool is added to `TOOL_IDS`, it fails if a matching `TOOL_REGISTRY` entry isn't also added.

## `TOOL_VARIABLES` — 3 tests

Validates the variable maps used for `{{placeholder}}` resolution.

| Test                                 | What it checks                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| has an entry for every tool ID       | Every tool has a variable map with at least a `TOOL_NAME`                           |
| cursor has all expected keys         | `RULES_DIR`, `RULES_EXT`, `SKILLS_DIR`, `GLOBAL_RULES`, `GLOBAL_SKILLS` all correct |
| claude has empty skills-related vars | `SKILLS_DIR`, `SKILLS_EXT`, `GLOBAL_SKILLS` are all `''`                            |

## `resolvePlaceholders` — 8 tests

The core placeholder resolution function. Most thoroughly tested because it's the foundation of cross-tool translation.

**Resolution rules:**

1. `{{VAR}}` with a non-empty value → replaced with the value
2. `{{VAR}}` with empty string → entire line removed
3. Unknown `{{VAR}}` → left as-is (passthrough)

| Test                                     | Scenario                                                       |
| ---------------------------------------- | -------------------------------------------------------------- |
| replaces known placeholders              | `{{TOOL_NAME}}` → `Cursor`, `{{RULES_DIR}}` → `.cursor/rules/` |
| resolves for claude                      | Cross-tool verification: `{{RULES_DIR}}` → `.claude/rules/`    |
| removes entire line when empty           | Claude's `{{SKILLS_DIR}}` line removed                         |
| keeps unknown placeholders               | `{{DOES_NOT_EXIST}}` unchanged                                 |
| multiple placeholders same line          | `{{RULES_DIR}}*{{RULES_EXT}}` → `.cursor/rules/*.mdc`          |
| removes line if any placeholder is empty | Mixed empty/non-empty on same line — line removed              |
| no placeholders                          | Plain text passes through unchanged                            |
| many lines removed (zed)                 | Zed has mostly empty vars → only static lines survive          |

## `quoteGlobs`

Not directly tested (it's a pre-processing step), but exercised indirectly by every test that parses `.mdc` frontmatter via `readRule`. Wraps `globs` values containing `*` in quotes before `gray-matter` parsing to avoid YAML alias errors. See [Tool Registry: Frontmatter Parsing](../tool-registry#frontmatter-parsing-globs-and-yaml) for the full explanation.

## `detectSourceTool` — 6 tests

Reverse detection: identifies which tool authored a document based on path patterns in the content.

| Test                                             | Scenario                                                       |
| ------------------------------------------------ | -------------------------------------------------------------- |
| detects cursor from .cursor/rules/ paths         | Strong signal path match                                       |
| detects claude from .claude/rules/ paths         | Cross-tool verification                                        |
| detects copilot from .github/instructions/ paths | Another tool variant                                           |
| returns null when no tool-specific paths found   | Generic content → `null`                                       |
| picks the tool with the most/strongest matches   | Weighted scoring: cursor + copilot paths → highest scorer wins |
| ignores values shorter than 4 characters         | Prevents false positives on short strings like `.md`           |

## `replaceWithPlaceholders` — 6 tests

The reverse of `resolvePlaceholders` — converts tool-specific paths back to `{{VAR}}` syntax.

| Test                                                        | Scenario                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| replaces cursor paths with placeholders                     | `.cursor/rules/` → `{{RULES_DIR}}`                          |
| replaces longest matches first                              | `.cursor/rules/my-rule.mdc` matched before `.cursor/rules/` |
| skips values shorter than 4 characters                      | Avoids replacing `.md` everywhere                           |
| reports replacement counts accurately                       | Returns per-variable replacement counts                     |
| returns unchanged content for tools with no matching values | No false positives                                          |
| handles multiple variable replacements across content       | Multiple vars replaced in one pass                          |

## `readRule` — 5 tests

File parsing into the `RuleFile` data structure. Uses temp directory fixtures.

| Test                           | Scenario                                                         |
| ------------------------------ | ---------------------------------------------------------------- |
| parses .mdc with frontmatter   | `description` extracted, `body` excludes `---`, `source` matches |
| parses .md without frontmatter | Description from first paragraph, `body` = full content          |
| detects placeholders           | `{{RULES_DIR}}` in body → `hasPlaceholders: true`                |
| strips .instructions suffix    | Copilot's `.instructions.md` → name is `"my-rule"`               |
| handles skill type             | `type: 'skill'` argument → `rule.type === 'skill'`               |

## `writeAsSingleFile` — 1 test

Writes a string to a path and reads it back to verify content integrity.

## `writeAsDirectory` — 6 tests

Writes a `RuleFile[]` as individual files in a tool's directory format.

| Test                                                       | What it checks                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| writes rules with correct extension                        | `.md` for Claude, content matches                                                     |
| writes rules into subdirectories                           | `directory: "testing"` → file at `testing/unit-tests.md`, root-level rules unaffected |
| writes into nested subdirectories                          | `directory: "infrastructure/deploy"` → nested directory created                       |
| writes numbered file prefixes when numbered option is true | `{ numbered: true }` → `01-name.md`, `02-name.md`                                     |
| writes unnumbered files when numbered option is false      | `{ numbered: false }` → `name.md` (no prefix)                                         |
| combines numbered prefixes with subdirectories             | Numbered files in subdirectories: `testing/01-name.md`                                |

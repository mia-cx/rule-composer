---
title: "decompose.test.ts"
created: 2026-02-08
modified: 2026-02-08
---

# decompose.test.ts — 13 tests

**Source**: `scripts/decompose/__tests__/decompose.test.ts`
**Module under test**: `scripts/decompose/index.ts` (exported helpers)

Tests the two exported helper functions from the decompose command: `extractProseDescription` and `buildRawContent`. These are responsible for generating frontmatter when decomposing a monolithic rules file into individual rule files.

## `extractProseDescription` — 8 tests

Finds the first line of prose in a rule section to use as the frontmatter `description`. Returns empty string if the first content is a table, list, or nothing useful — preventing non-descriptive frontmatter.

### Prose extraction

| Test                      | Input                                      | Result                                   |
| ------------------------- | ------------------------------------------ | ---------------------------------------- |
| extracts first prose line | `## Approach\n\nPlan first, confirm...`    | `"Plan first, confirm, then implement."` |
| skips blanks and headings | `## Section\n\n\n### Sub\n\nActual prose.` | `"Actual prose here."`                   |
| content without heading   | `Just some prose without any heading.`     | `"Just some prose without any heading."` |
| trims whitespace          | `## Section\n\n   Indented prose.  `       | `"Indented prose."`                      |
| truncates to 120 chars    | 200-character line                         | Result is 120 chars                      |

### Returns empty for non-prose content

| Test                 | First content type    | Examples                                               |
| -------------------- | --------------------- | ------------------------------------------------------ |
| table                | `\|` rows             | `\| Preference \| Detail \|`                           |
| list (any syntax)    | `-`, `*`, `+`, `1.`   | All four list syntaxes tested in one consolidated test |
| heading-only / empty | Only headings or `""` | No prose to extract                                    |

## `buildRawContent` — 5 tests

Wraps a markdown body with YAML frontmatter containing `alwaysApply: true` and an optional `description`. Only generates frontmatter for tools that support it.

| Test                              | `hasFrontmatter` | `description`            | Result                                                         |
| --------------------------------- | ---------------- | ------------------------ | -------------------------------------------------------------- |
| adds frontmatter with description | `true`           | `"Plan first."`          | `---\nalwaysApply: true\ndescription: Plan first.\n---` + body |
| omits description when empty      | `true`           | `""`                     | Frontmatter has `alwaysApply` but no `description` key         |
| returns plain body                | `false`          | any                      | Body unchanged, no `---` delimiters                            |
| round-trips through gray-matter   | `true`           | `"Content with bold..."` | Parse → stringify → parse produces identical data              |
| preserves multiline body          | `true`           | `"Use early returns."`   | H3 subsections and all content survive frontmatter wrapping    |

---
title: "composer.test.ts"
created: 2026-02-08
modified: 2026-02-08
---

# composer.test.ts — 22 tests

**Source**: `scripts/compose/__tests__/composer.test.ts`
**Module under test**: `scripts/compose/composer.ts`

Tests the composition pipeline that merges selected rules into a single markdown document, section numbering, and the token estimation utility.

## Test Fixtures

Uses a `makeRule()` factory function that creates `RuleFile` objects with sensible defaults. Tests override only the properties relevant to each scenario:

```typescript
const makeRule = (overrides: Partial<RuleFile> = {}): RuleFile => ({
  path: "/fake/path/rule.mdc",
  name: "test-rule",
  description: "A test rule",
  body: "# Test Rule\n\nSome content.",
  rawContent: "---\ndescription: A test rule\n---\n\n# Test Rule\n\nSome content.",
  source: "agents-repo",
  type: "rule",
  hasPlaceholders: false,
  ...overrides,
})
```

## `compose` — 11 tests

The `compose(rules, targetTool, options?)` function strips frontmatter from each rule, resolves placeholders for the target tool, optionally numbers H2 headings, and concatenates them.

| Test                                                | What it checks                                                  |
| --------------------------------------------------- | --------------------------------------------------------------- |
| strips frontmatter and joins rules                  | YAML `---` blocks removed from `rawContent`, rules concatenated |
| counts placeholders before resolution               | Returns `placeholderCount` reflecting `{{VAR}}`s found          |
| resolves placeholders for target tool               | `{{RULES_DIR}}*{{RULES_EXT}}` becomes `.cursor/rules/*.mdc`     |
| removes lines with empty-value placeholders         | Claude: lines referencing `{{SKILLS_DIR}}` disappear            |
| returns empty content for empty selection           | `compose([], 'cursor')` returns empty content                   |
| separates rules with double newlines                | Two rules joined with `\n\n`                                    |
| adds numbered prefixes when numbered option is true | `{ numbered: true }` → `## 1. Approach`, `## 2. Coding`         |
| does not add numbers when numbered option is false  | `{ numbered: false }` → headings unchanged                      |

## `addSectionNumbers` — 3 tests

Adds sequential numbered prefixes (1., 2., 3., …) to all H2 headings by position. Strips any existing `N.` from heading text so numbers always reflect order (e.g. `## 99. Rule Name` as 5th section becomes `## 5. Rule Name`). H3+ are left untouched.

| Test                                   | What it checks                                                       |
| -------------------------------------- | -------------------------------------------------------------------- |
| adds sequential numbers to H2 headings | `## Approach` → `## 1. Approach`, `## Coding` → `## 2. Coding`       |
| skips already-numbered headings        | `## 1. Approach` left as-is, counter still increments for unnumbered |
| does not touch H3+ headings            | `### Details` remains unnumbered                                     |
| handles content with no headings       | Plain text passes through unchanged                                  |

## `estimateTokens` — 3 tests

OpenAI-style token count via `gpt-tokenizer` (o200k_base). Displayed as `~N` in the CLI to indicate model-specific. Used for the compose summary line and diff preview.

| Test                           | What it checks                                              |
| ------------------------------ | ----------------------------------------------------------- |
| returns OpenAI-style count     | `estimateTokens(text)` equals `countTokens(text)` from lib  |
| handles empty string           | `""` → 0                                                    |
| returns positive for non-empty | Multiline and whitespace-heavy strings yield positive count |

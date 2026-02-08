---
title: "composer.test.ts"
created: 2026-02-08
modified: 2026-02-08
---

# composer.test.ts — 9 tests

**Source**: `scripts/compose/__tests__/composer.test.ts`
**Module under test**: `scripts/compose/composer.ts`

Tests the composition pipeline that merges selected rules into a single markdown document, and the token estimation utility.

## Test Fixtures

Uses a `makeRule()` factory function that creates `RuleFile` objects with sensible defaults. Tests override only the properties relevant to each scenario:

```typescript
const makeRule = (overrides: Partial<RuleFile> = {}): RuleFile => ({
  path: '/fake/path/rule.mdc',
  name: 'test-rule',
  description: 'A test rule',
  body: '# Test Rule\n\nSome content.',
  rawContent: '---\ndescription: A test rule\n---\n\n# Test Rule\n\nSome content.',
  source: 'agents-repo',
  type: 'rule',
  hasPlaceholders: false,
  ...overrides,
});
```

## `compose` — 6 tests

The `compose(rules, targetTool)` function strips frontmatter from each rule, resolves placeholders for the target tool, and concatenates them.

| Test | What it checks |
|------|---------------|
| strips frontmatter and joins rules | YAML `---` blocks removed from `rawContent`, rules concatenated |
| counts placeholders before resolution | Returns `placeholderCount` reflecting `{{VAR}}`s found |
| resolves placeholders for target tool | `{{RULES_DIR}}*{{RULES_EXT}}` becomes `.cursor/rules/*.mdc` |
| removes lines with empty-value placeholders | Claude: lines referencing `{{SKILLS_DIR}}` disappear |
| returns empty content for empty selection | `compose([], 'cursor')` returns empty content |
| separates rules with double newlines | Two rules joined with `\n\n` |

## `estimateTokens` — 3 tests

A rough token estimator: `Math.ceil(words * 1.3)`. Used to show approximate token counts in the CLI.

| Test | Input | Expected |
|------|-------|---------|
| basic | `"hello world"` (2 words) | 3 |
| empty string | `""` | 0 |
| multiline and whitespace | `"line one\nline two\nline three"` (6 words), `"  hello   world  "` (2 words) | 8, 3 |

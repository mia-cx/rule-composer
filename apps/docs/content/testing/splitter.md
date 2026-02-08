---
title: "splitter.test.ts"
created: 2026-02-08
modified: 2026-02-08
---

# splitter.test.ts — 9 tests

**Source**: `scripts/decompose/__tests__/splitter.test.ts`
**Module under test**: `scripts/decompose/splitter.ts`

Tests the heading-based markdown splitting logic used by the `decompose` subcommand. This is the offline (no-LLM) strategy for breaking a monolithic rules file into modular individual rules.

## How the splitter works

`splitByHeadings(markdown)` walks through lines and:

1. Collects content before the first `##` as a potential "preamble" section
2. Splits on each `##` (H2) boundary — each H2 starts a new section
3. `###` (H3) and deeper headings stay with their parent H2
4. Converts heading text to kebab-case for the filename
5. Extracts description from the first non-heading line

## Test cases

### Core splitting behavior — 3 tests

| Test | Input | Expected |
|------|-------|----------|
| splits on H2 boundaries | `## Approach` ... `## Coding` | 2 sections: `approach`, `coding` |
| keeps H3 with parent H2 | `## Testing` / `### Unit Tests` / `### E2E Tests` | 1 section containing all three headings |
| handles consecutive H2s | `## First\n## Second` | 2 sections; first has only its heading line |

### Name generation — 1 test (consolidated)

| Heading text | Generated name |
|-------------|---------------|
| `"My Complex Heading Name"` | `"my-complex-heading-name"` |
| `"Testing & Verification (v2)"` | `"testing-verification-v2"` |

The `toKebabCase` internal function strips non-alphanumeric characters, replaces spaces with hyphens, and collapses consecutive hyphens.

### Description extraction — 1 test

| Content | Extracted description |
|---------|---------------------|
| `## Approach\n\nPlan first, confirm...` | `"Plan first, confirm, then implement."` |

### Preamble handling — 2 tests

| Test | Scenario | Result |
|------|----------|--------|
| captures meaningful preamble | Text before first `##` | Creates a `"preamble"` section |
| ignores H1-only preamble | Only `# Title` before `##` | No preamble section |

### Edge cases — 2 tests (consolidated)

| Input | Result |
|-------|--------|
| `""` | `[]` — no sections |
| `# Just an H1\n\nSome text.` | Single `"preamble"` section (no H2s found) |
| Trailing `\n\n` | Section content trimmed |

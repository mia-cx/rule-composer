---
title: "splitter.test.ts"
created: 2026-02-08
modified: 2026-02-08
---

# splitter.test.ts — 17 tests

**Source**: `scripts/decompose/__tests__/splitter.test.ts`
**Module under test**: `scripts/decompose/splitter.ts`

Tests the heading-based markdown splitting logic and heading number stripping used by the `decompose` subcommand.

## How the splitter works

`splitByHeadings(markdown)` walks through lines and:

1. Collects content before the first `##` as a potential "preamble" section
2. Splits on each `##` (H2) boundary — each H2 starts a new section
3. `###` (H3) and deeper headings stay with their parent H2
4. Strips numbered prefixes (e.g., `## 1. Approach` → `## Approach`) from both filenames and content
5. Converts heading text to kebab-case for the filename
6. Extracts description from the first non-heading line

## `splitByHeadings` — 12 tests

### Core splitting behavior — 3 tests

| Test                    | Input                                             | Expected                                    |
| ----------------------- | ------------------------------------------------- | ------------------------------------------- |
| splits on H2 boundaries | `## Approach` ... `## Coding`                     | 2 sections: `approach`, `coding`            |
| keeps H3 with parent H2 | `## Testing` / `### Unit Tests` / `### E2E Tests` | 1 section containing all three headings     |
| handles consecutive H2s | `## First\n## Second`                             | 2 sections; first has only its heading line |

### Name generation — 1 test (consolidated)

| Heading text                    | Generated name              |
| ------------------------------- | --------------------------- |
| `"My Complex Heading Name"`     | `"my-complex-heading-name"` |
| `"Testing & Verification (v2)"` | `"testing-verification-v2"` |

### Description extraction — 1 test

| Content                                 | Extracted description                    |
| --------------------------------------- | ---------------------------------------- |
| `## Approach\n\nPlan first, confirm...` | `"Plan first, confirm, then implement."` |

### Preamble handling — 2 tests

| Test                         | Scenario                   | Result                         |
| ---------------------------- | -------------------------- | ------------------------------ |
| captures meaningful preamble | Text before first `##`     | Creates a `"preamble"` section |
| ignores H1-only preamble     | Only `# Title` before `##` | No preamble section            |

### Heading number stripping — 3 tests

| Test                                    | Input            | Expected                                   |
| --------------------------------------- | ---------------- | ------------------------------------------ |
| strips numbered prefixes from filenames | `## 1. Approach` | name: `approach`, not `1-approach`         |
| strips numbered prefixes from content   | `## 3. Testing`  | content contains `## Testing`, not `## 3.` |
| handles unnumbered headings (no-op)     | `## Approach`    | name and content unchanged                 |

### Edge cases — 2 tests (consolidated)

| Input                        | Result                                     |
| ---------------------------- | ------------------------------------------ |
| `""`                         | `[]` — no sections                         |
| `# Just an H1\n\nSome text.` | Single `"preamble"` section (no H2s found) |
| Trailing `\n\n`              | Section content trimmed                    |

## `stripHeadingNumber` — 5 tests

Strips `N. ` prefixes from heading text. Used by the splitter for both filenames and content.

| Test                              | Input                      | Expected               |
| --------------------------------- | -------------------------- | ---------------------- |
| strips single-digit prefix        | `"1. Approach"`            | `"Approach"`           |
| strips multi-digit prefix         | `"12. Coding Conventions"` | `"Coding Conventions"` |
| returns unchanged when no prefix  | `"Approach"`               | `"Approach"`           |
| ignores numbers without dot-space | `"100 Tips"`               | `"100 Tips"`           |
| strips zero-padded prefix         | `"03. Testing"`            | `"Testing"`            |

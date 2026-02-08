---
title: "matcher.test.ts"
created: 2026-02-08
modified: 2026-02-08
---

# matcher.test.ts — 14 tests

**Source**: `scripts/decompose/__tests__/matcher.test.ts`
**Module under test**: `scripts/decompose/matcher.ts`

Tests the heading-map parser and the content reconstruction logic that maps AI-provided heading references back to source document content. This module ensures that AI-assisted decomposition always uses original content — the LLM only provides metadata (which headings belong to which rule), never the actual text.

## Sample Document

Tests use a shared `SAMPLE_DOC` constant with 4 H2 sections, H3 subsections, and a preamble:

```
# My Rules
Some preamble text here.
## Approach         → "Plan first, confirm, then implement."
## Coding Conventions → "Use early returns and guard clauses." + ### Naming
## Testing          → "Write tests with Vitest."
## Communication    → "Be concise."
```

## `parseHeadingMap` — 5 tests

Parses a markdown document into a `Map<string, string>` where keys are H2 heading texts and values are their full section content (including the heading line itself).

| Test                             | What it checks                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| creates heading map              | All 4 H2s are present as keys                                                            |
| captures preamble                | Content before first H2 stored under `__preamble__` key                                  |
| includes H3 with parent H2       | "Coding Conventions" section includes `### Naming` and its content                       |
| empty input and H1-only preamble | Empty string → empty map; `# Title\n\n## Section` → no preamble (H1-only not meaningful) |
| preserves content accurately     | Exact string match for section content                                                   |

## `reconstructFromHeadings` — 9 tests

Takes the original markdown and AI-provided metadata (`DecomposeResponse`) and produces `SplitResult[]` by copying content from the source document based on heading references.

### Core mapping

| Test              | Headings                            | Result                                  |
| ----------------- | ----------------------------------- | --------------------------------------- |
| single heading    | `["Approach"]`                      | 1 split with "Plan first" content       |
| multiple headings | `["Coding Conventions", "Testing"]` | 1 split with both sections concatenated |
| `__preamble__`    | `["__preamble__"]`                  | 1 split with preamble content           |
| multiple rules    | 3 rules claiming different headings | 3 splits, only preamble unclaimed       |

### Warnings

| Test                   | Scenario                                 | Warning type                                                            |
| ---------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| unmatched heading      | `"Nonexistent Heading"` in headings list | `unmatched-heading` — heading skipped, valid ones still produce content |
| all headings unmatched | Only invalid headings                    | No splits produced, `unmatched-heading` warnings                        |
| unclaimed sections     | Only "Approach" claimed                  | `unclaimed-section` for Coding Conventions, Testing, Communication      |

### Metadata passthrough

| Test                        | What it checks                                                                  |
| --------------------------- | ------------------------------------------------------------------------------- |
| directory field             | `directory: "core"` passes through to `SplitResult.directory`                   |
| empty rules and description | Empty rules → no splits + unclaimed warnings; AI description preserved in split |

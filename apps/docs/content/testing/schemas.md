---
title: "schemas.test.ts"
created: 2026-02-08
modified: 2026-02-08
---

# schemas.test.ts — 24 tests

**Source**: `scripts/shared/__tests__/schemas.test.ts`
**Module under test**: `scripts/shared/schemas.ts`

Tests all four Zod schemas used for validating external data — API responses, LLM output, file frontmatter, and decomposition results. Every boundary where untrusted data enters the system has a schema, and every schema has both positive and negative test cases.

## `openRouterResponseSchema` — 4 tests

Validates the shape of responses from the OpenRouter chat completions API.

**Schema shape:**

```typescript
{
  id: string,
  choices: [{ message: { content: string }, finish_reason: string | null }],
  usage?: { prompt_tokens: number, completion_tokens: number, total_tokens: number }
}
```

| Test                            | Valid/Invalid | What it checks                                               |
| ------------------------------- | ------------- | ------------------------------------------------------------ |
| accepts valid response          | Valid         | Full response with `id`, `choices` array, and `usage` object |
| accepts without usage           | Valid         | `usage` is optional — some API responses omit it             |
| rejects missing id              | Invalid       | `id` field is required                                       |
| rejects missing message content | Invalid       | `choices[].message.content` must be a string                 |

## `optimizedOutputSchema` — 4 tests

Guards against LLM-optimized output that is malformed. The LLM is supposed to return optimized markdown, but it might return something too short, without headings, or accidentally as JSON.

| Test                        | Valid/Invalid | What it checks                                      |
| --------------------------- | ------------- | --------------------------------------------------- |
| accepts valid markdown      | Valid         | 50+ chars with heading — passes all three rules     |
| rejects too short           | Invalid       | `"# Short"` (7 chars) fails minimum length          |
| rejects no headings         | Invalid       | Long text without any `#` character                 |
| rejects JSON-looking output | Invalid       | Contains ` ```json ` — LLM returned structured data |

## `ruleFrontmatterSchema` — 5 tests

Validates `.mdc` frontmatter fields. All fields are optional, but when present they must have correct types.

| Test                          | Valid/Invalid | What it checks                               |
| ----------------------------- | ------------- | -------------------------------------------- |
| accepts valid frontmatter     | Valid         | `description` string + `alwaysApply: true`   |
| globs as string               | Valid         | Single glob pattern: `"**/*.ts"`             |
| globs as array                | Valid         | Multiple patterns: `["**/*.ts", "**/*.tsx"]` |
| accepts empty object          | Valid         | All fields optional — `{}` is valid          |
| rejects alwaysApply as string | Invalid       | `"yes"` is not boolean                       |

## `decomposeResponseSchema` — 11 tests

Validates the structured JSON array the LLM returns during AI-assisted decomposition. Uses metadata-only format — the AI returns heading references, not full content.

**Schema shape:**

```typescript
Array<{
  name: string // kebab-case: /^[a-z0-9]+(-[a-z0-9]+)*$/
  description: string // min 5 chars
  headings: string[] // min 1 — references to source H2 headings or "__preamble__"
  directory?: string // optional kebab-case path: /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/
}>
```

### Headings validation

| Test                                 | What it checks                                                    |
| ------------------------------------ | ----------------------------------------------------------------- |
| accepts valid response with headings | Array of two rules, each with a `headings` array                  |
| accepts multiple headings            | Single rule referencing 3 headings — content will be concatenated |
| accepts `__preamble__`               | Special key for content before the first H2                       |
| rejects empty headings               | `headings: []` fails — must reference at least one heading        |

### Name and description validation

| Test                                         | What it checks                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| rejects invalid names and short descriptions | PascalCase, underscores, and 2-char descriptions all fail (consolidated test) |
| accepts empty array                          | `[]` is valid — the LLM might decide nothing can be split                     |

### Directory field validation

| Test                               | What it checks                                                            |
| ---------------------------------- | ------------------------------------------------------------------------- |
| accepts valid directory            | Single segment: `"testing"`                                               |
| accepts nested path                | Multi-segment: `"infrastructure/deploy"`                                  |
| optional and defaults to undefined | Omitted field is `undefined`                                              |
| rejects invalid values             | Uppercase, underscores, and trailing slashes all fail (consolidated test) |

### Backwards compatibility

| Test                           | What it checks                                                            |
| ------------------------------ | ------------------------------------------------------------------------- |
| rejects missing headings field | Old-format responses with `content` instead of `headings` fail validation |

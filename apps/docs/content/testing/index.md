---
title: Testing Overview
created: 2026-02-08
modified: 2026-02-08
---

# Testing

230 tests across 15 files covering placeholder resolution, rule composition, markdown splitting, schema validation, tree data structures, filesystem scanning, variant generation, decompose helpers, heading reconstruction, sync, and end-to-end integration.

## Quick Reference

```bash
pnpm test          # Run all tests once
pnpm test:watch    # Run in watch mode (re-runs on file change)
```

## Configuration

Tests use [Vitest](https://vitest.dev) with a root-level config in `vitest.config.ts`:

```typescript
{
  test: {
    include: ['scripts/**/__tests__/**/*.test.ts'],
    exclude: ['apps/**', 'node_modules/**'],
  }
}
```

- **Include pattern**: Only picks up `*.test.ts` files inside `__tests__/` directories under `scripts/`.
- **Excludes**: `apps/` is excluded because `apps/docs/` (Quartz) has its own test setup and dependencies.

## Directory Layout

```
scripts/
  shared/
    __tests__/
      formats.test.ts         43 tests
      schemas.test.ts         16 tests
      tree-prompt.test.ts     10 tests
      scanner.test.ts          13 tests  ← sortRulesByFilenamePrefix, getProjectDisplayName, detectTools, resolveAgentsRepo
      integration.test.ts     12 tests   ← golden-file integration tests
      fixtures/                           ← test input and expected outputs
        input/AGENTS.md
        decompose-expected/*.mdc
        compose-expected/*.md
      generate-fixtures.ts               ← regenerates golden files
  compose/
    __tests__/
      composer.test.ts        22 tests
      variants.test.ts        10 tests
  decompose/
    __tests__/
      splitter.test.ts        15 tests
      decompose.test.ts       13 tests
      matcher.test.ts        14 tests
  sync/
    __tests__/
      sync.test.ts            19 tests   ← findSyncSourceDirs, buildSyncSourceTree, layout, category list
      cursor-db.test.ts        8 tests
```

## Test Categories

| Category        | Tests | Modules                                                                                                                                              | What's verified                                     |
| --------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Pure logic      | 98    | `resolvePlaceholders`, `compose`, `addSectionNumbers`, `estimateTokens`, `splitByHeadings`, `stripHeadingNumber`, all Zod schemas, `parseHeadingMap` | No I/O. Fast. Deterministic.                        |
| Data structures | 10    | `buildTree`, `getSelectedRules`                                                                                                                      | Tree construction from sources, selection filtering |
| Helpers         | 13    | `extractProseDescription`, `buildRawContent`                                                                                                         | Decompose frontmatter generation                    |
| Reconstruction  | 14    | `reconstructFromHeadings`, `parseHeadingMap`                                                                                                         | Heading-based content mapping with warnings         |
| File I/O        | 36    | `readRule`, `writeAsSingleFile`, `writeAsDirectory` (incl. numbered), `detectTools`, `resolveAgentsRepo`, `generateVariants`                         | Real filesystem via temp dirs.                      |
| Integration     | 15    | Compose + decompose + reconstruct pipelines                                                                                                          | End-to-end against golden fixtures                  |

## Test Files

Detailed documentation for each test file:

- [formats.test.ts](testing/formats) — Tool registry, variable maps, placeholder resolution, file I/O (43 tests)
- [composer.test.ts](testing/composer) — Rule composition, section numbering, and token estimation (21 tests)
- [splitter.test.ts](testing/splitter) — Heading-based markdown splitting, heading number stripping (15 tests)
- [schemas.test.ts](testing/schemas) — Zod schema validation for 4 schemas (16 tests)
- [tree-prompt.test.ts](testing/tree-prompt) — Tree building and selection extraction (10 tests)
- [scanner.test.ts](testing/scanner) — Tool detection, project-name label, agents repo resolution, rule order by filename prefix (13 tests)
- [variants.test.ts](testing/variants) — `coding-tools/` directory generation (10 tests)
- [decompose.test.ts](testing/decompose) — Prose extraction and frontmatter generation (13 tests)
- [matcher.test.ts](testing/matcher) — Heading map parsing and content reconstruction (14 tests)
- [integration.test.ts](testing/integration) — End-to-end pipeline tests with golden fixtures (12 tests)
- [sync.test.ts](testing/sync) — Sync layout detection, recursive source scan (findSyncSourceDirs), source tree, category list (19 tests). `runSync` source/direction prompts are interactive and not unit tested.
- cursor-db.test.ts — Cursor DB helpers (8 tests)

## Patterns

### Fixture Factories

Test files for `composer.test.ts` and `tree-prompt.test.ts` use `makeRule()` / `makeSource()` factory functions to create test data with sensible defaults and targeted overrides:

```typescript
const makeRule = (overrides: Partial<RuleFile> = {}): RuleFile => ({
  path: "/fake/path/rule.mdc",
  name: "test-rule",
  // ...defaults...
  ...overrides,
})
```

### Golden File Fixtures

Integration tests use pre-generated "golden" files as expected outputs. A hand-written `input/AGENTS.md` feeds through the real `splitByHeadings`, `writeAsDirectory`, and `compose` functions to produce `decompose-expected/` and `compose-expected/` fixtures.

Regenerate fixtures after changing core logic:

```bash
pnpm generate-fixtures
```

### Temp Directories

Tests that need real filesystem operations create isolated temp directories via `os.tmpdir()`:

```typescript
const tmpDir = join(tmpdir(), "arc-test-<name>")

beforeAll(async () => {
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})
```

Each test group uses a unique prefix (`arc-test-readrule`, `arc-test-detect`, etc.) to avoid collisions when running in parallel.

### No Mocking

Tests use real implementations against real (temp) filesystems rather than mocking `fs`. This gives higher confidence that the code works correctly end-to-end, at the cost of slightly slower tests (~1s total).

## Adding New Tests

### For a New Module

1. Create `scripts/<area>/__tests__/<module>.test.ts`
2. Import from the module using `.js` extension (ESM resolution):
   ```typescript
   import { myFunction } from "../my-module.js"
   ```
3. Follow the existing pattern: `describe` per export, `it` per behavior.

### For a New Zod Schema

Add both valid and invalid cases. Test edge cases (empty inputs, wrong types, boundary values). See [schemas.test.ts](testing/schemas) for the established pattern.

### For New Tool Support

When adding a new tool to `TOOL_REGISTRY` and `TOOL_VARIABLES`:

1. `formats.test.ts` — The "has an entry for every tool ID" test auto-covers new tools via `TOOL_IDS` iteration.
2. Add specific placeholder tests if the tool has unusual variable combinations.
3. `variants.test.ts` — Add the tool ID to one of the `generateVariants` calls to verify its output.

## What's Not Tested

Interactive/side-effect-heavy modules that are intentionally untested:

| Module                              | Why                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `cli.ts`                            | Interactive prompts (`@clack/prompts`). Would require stdin mocking.                                      |
| `tree-prompt.ts` (interactive part) | `treeMultiSelect` reads from stdin. Only `buildTree` and `getSelectedRules` are tested.                   |
| `openrouter.ts`                     | HTTP calls to OpenRouter API. Would require network mocking or a test API key.                            |
| `compose/index.ts`                  | Orchestration — calls cli, composer, openrouter, formats, variants. Covered by unit tests of each module. |
| `decompose/index.ts`                | Orchestration — calls cli, splitter, matcher, openrouter, formats. Covered by unit tests of each module.  |
| `sync/index.ts` (`runSync`)         | Orchestration — source tree (repo vs coding-tools/X), layout prompt, direction, delete-stale, syncDir. Helpers unit tested. |
| `index.ts`                          | Thin subcommand router.                                                                                   |

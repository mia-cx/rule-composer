# Regenerate Test Fixtures

Regenerate the golden fixture files used by integration tests.

## When to regenerate

Run this after changing any of:

- `splitByHeadings()` in `scripts/decompose/splitter.ts`
- `compose()` in `scripts/compose/composer.ts`
- `writeAsDirectory()` in `scripts/shared/formats.ts`
- `readRule()` in `scripts/shared/formats.ts`
- Prettier config (`.prettierrc`)
- The input fixture (`scripts/shared/__tests__/fixtures/input/AGENTS.md`)

## Steps

### 1. Run the generator

```bash
pnpm generate-fixtures
```

This runs `scripts/shared/__tests__/generate-fixtures.ts` via `tsx`. It:

1. Reads `fixtures/input/AGENTS.md`
2. Splits it with `splitByHeadings()`
3. Writes decomposed `.mdc` files to `fixtures/decompose-expected/`
4. Reads them back and composes for Cursor and Claude
5. Writes composed output to `fixtures/compose-expected/`

### 2. Run integration tests

```bash
pnpm test scripts/shared/__tests__/integration.test.ts
```

All 19 tests should pass.

### 3. Spot-check the output

Review the generated files in `fixtures/decompose-expected/` and `fixtures/compose-expected/` to confirm they look correct.

### 4. Run the full test suite

```bash
pnpm test
```

All tests should pass (run `pnpm test`).

## File locations

| Path                                                    | Purpose                                            |
| ------------------------------------------------------- | -------------------------------------------------- |
| `scripts/shared/__tests__/fixtures/input/AGENTS.md`     | Hand-written input (edit this to change test data) |
| `scripts/shared/__tests__/fixtures/decompose-expected/` | Golden decomposed `.mdc` files                     |
| `scripts/shared/__tests__/fixtures/compose-expected/`   | Golden composed `.md` files                        |
| `scripts/shared/__tests__/generate-fixtures.ts`         | The generator script                               |

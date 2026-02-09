# Add a New Coding Tool

Add support for a new AI coding tool to rule-composer.

## Prerequisites

- Know the tool's rule directory structure, file extension, and whether it supports YAML frontmatter
- Know the tool's variable names (rule dir, skill dir, etc.)

## Steps

### 1. Add the tool ID

In `scripts/shared/types.ts`, add the new ID to the `TOOL_IDS` array (kebab-case, alphabetical order).

### 2. Add the tool config

In `scripts/shared/formats.ts`, add a `ToolConfig` entry to `TOOL_REGISTRY`:

```typescript
'new-tool': {
  label: 'New Tool',
  directories: ['.new-tool/rules/'],    // directories to scan for rules
  singleFiles: [],                       // standalone rule files (e.g., 'RULES.md')
  extension: '.md',                      // file extension for rules
  hasFrontmatter: false,                 // true only if tool supports YAML frontmatter
},
```

### 3. Add the variable map

In `scripts/shared/formats.ts`, add a complete entry to `TOOL_VARIABLES`:

```typescript
'new-tool': {
  TOOL_NAME: 'New Tool',
  RULES_DIR: '.new-tool/rules/',
  RULES_EXT: '.md',
  SKILLS_DIR: '',           // empty string if unsupported → lines removed during resolution
  SKILLS_EXT: '',
  GLOBAL_RULES: '',
  GLOBAL_SKILLS: '',
  RULE_EXAMPLE: '',
},
```

Every key must be present. Use `''` for unsupported features.

### 4. Run existing tests

```bash
pnpm test
```

Most tests auto-cover via `TOOL_IDS` iteration — they should pass without changes.

### 5. Regenerate fixtures and variant output

```bash
pnpm generate-fixtures
pnpm build-variants
```

### 6. Verify variant output

Check `coding-tools/<new-tool>/` for correctly resolved files.

## Notes

- Detection works by scanning CWD for the directories/files listed in the config.
- Placeholder resolution removes entire lines when the variable value is `''`.
- `hasFrontmatter: true` is only for tools that parse YAML front matter (currently only Cursor `.mdc`).

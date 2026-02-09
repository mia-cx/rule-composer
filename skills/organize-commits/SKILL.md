---
name: organize-commits
description: Splits uncommitted changes into a small set of logical, single-concern git commits. Use when the user wants to organize changes into logical commits, split a large change into multiple commits, or create a series of conventional commits from the current working tree.
---

# Organize Changes Into Logical Commits

You organize uncommitted changes into atomic, single-concern commits (e.g. one per: config, formatting, behavior, tests, docs) so history stays readable. Follow the workflow below.

## Workflow

### 1. Inspect current state

- Run `git status`, `git diff`, and (if anything is staged) `git diff --staged`.
- Record which files and areas changed: config, source, tests, docs, rules.

### 2. Group by logical concern

Assign each change to one **concern**; one commit per concern, not per file. Use this mapping:

| Concern            | Examples                                         | Conventional type              |
| ------------------ | ------------------------------------------------ | ------------------------------ |
| Config / tooling   | ESLint, Prettier, tsconfig, package.json scripts | `chore` or `build`             |
| Formatting only    | Blank lines, quotes, line length                 | `style` or `chore(style)`      |
| Feature / behavior | New logic, compose order, numbering              | `feat` or `fix`                |
| Tests              | New or moved tests, fixtures                     | `test`                         |
| Docs / rules       | AGENTS.md, docs content, .mdc rules, skills      | `docs`                         |
| Misc / cleanup     | Unrelated small fixes                            | `chore` or split when feasible |

When a single file has edits that span two concerns, assign it to the dominant concern and note the mix.

### 3. Creating commands

Produce an ordered commit plan (scope + message per commit), then the exact commands. Keep commits atomic; order them so history reads logically: config → code → tests → docs.

1. **Proposal**: Output a list or table of commits. For each commit include scope (paths) and message. Use short path forms or globs (e.g. `scripts/shared/*.ts`).
2. **Commands**: Output one set of copy-pastable commands only. Use globs in `git add` (e.g. `git add "**/organize-commits/SKILL.md"` or `git add scripts/shared/*.ts`); git expands globs. Each line: `bash\ngit add <paths> && git commit -m "<message>" [ -m "<body>" ] --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>"\n`. Always include the trailer. If there are more than 3 commits, put all commands in a single code block (one command per line) and omit the numbered list.
3. **Close**: Ask: **"Want to change anything? Let me know, and I'll give you a new proposal and commands."**

### 4. Revisions

When the user requests changes: update the plan (merge, split, reword, or reorder commits), then output a new proposal, command list, and the same closing question.

## Commit message format

- **Conventional commits**: `type(scope): subject`. Types: `chore`, `feat`, `fix`, `docs`, `test`, `style`, `refactor`.
- **Subject**: Present tense, under ~72 chars, no trailing period.
- **Body**: Add when the subject is insufficient. Use a second `-m "<body>"` in the command when you need to explain why or what, add context or rationale, or call out breaking changes or migration steps.

Project rules may override (e.g. `{{RULES_DIR}}*{{RULES_EXT}}` with commit-message guidance).

## Example proposal and commands

Example output shape:

| Concern            | Files / hunks                                     | Summary / commit message                                               |
| ------------------ | ------------------------------------------------- | ---------------------------------------------------------------------- |
| Config / tooling   | `package.json`                                    | chore(build): add validate script and @types/node                      |
| Formatting only    | `scripts/shared/*.ts`                             | style(formats): ensure blank line after frontmatter in buildRawContent |
| Feature / behavior | `scripts/decompose/index.ts`                      | fix(decompose): correct section index and guard empty headings         |
| Tests              | `scripts/decompose/__tests__/placeholder.test.ts` | test(decompose): add placeholder resolution tests                      |
| Docs / rules       | `apps/docs/content/*.md`, `.cursor/rules/*.mdc`   | docs: document validate and sync, add PRIVATE\_ env rule               |

````bash
git add package.json && git commit -m "chore(build): add validate script and @types/node" --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>"```
````

````bash
git add scripts/shared/*.ts && git commit -m "style(formats): ensure blank line after frontmatter in buildRawContent" --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>"```
````

````bash
git add scripts/decompose/index.ts && git commit -m "fix(decompose): correct section index and guard empty headings" --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>"```
````

````bash
git add scripts/decompose/__tests__/placeholder.test.ts && git commit -m "test(decompose): add placeholder resolution tests" --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>"```
````

````bash
git add apps/docs/content/*.md .cursor/rules/*.mdc && git commit -m "docs: document validate and sync, add PRIVATE_ env rule" --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>"```
````

## Checklist before finishing

- [ ] Proposal (list or table) with scope and message per commit.
- [ ] Numbered command list with trailer; body (`-m`) only when needed.
- [ ] Commits are atomic; every change in exactly one commit; messages conventional.

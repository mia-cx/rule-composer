# Rules and Skills

Actively build and expand `.aiassistant/rules/` and `.junie/` as you work. These persist context for future conversations.

**Rules** (`.aiassistant/rules/*.md`) — For project knowledge: architecture decisions, conventions, patterns, gotchas. One concern per file, under 50 lines. Use `alwaysApply: true` for project-wide context, `globs` for file-scoped patterns. Include "do / don't" examples for coding patterns.

**Skills** (`.junie/*/.md`) — For repeatable multi-step workflows that may include scripts. Use `disable-model-invocation: true` for manual-only (`/skill-name`) invocation. Keep `SKILL.md` focused; move detailed references to `references/`.

**Proactive creation:** When you discover an architectural decision, debug a non-obvious gotcha, or build a repeatable workflow — write a rule or skill for it immediately. Don't ask.

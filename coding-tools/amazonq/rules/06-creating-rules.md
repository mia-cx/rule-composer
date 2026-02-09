# Creating Rules, Skills and Subagents

**CRITICAL — You MUST create rules, skills and subagents as you work.** Every conversation that touches architecture, debugging, or implementation MUST leave behind captured knowledge.

**Rules** (`.amazonq/rules/*.md`) — Project knowledge: architecture decisions, conventions, patterns, gotchas. One concern per file, under 50 lines. Use `alwaysApply: true` for project-wide context, `globs` for file-scoped patterns.

## Mandatory triggers

Create a **rule** when you: make an architectural decision, discover a non-obvious gotcha, establish a repeatable pattern, or resolve a recurring bug.

Create a **skill** when you: complete a multi-step workflow the user will repeat, or build a process involving CLI commands or tool sequences.

Create a **subagent** when you: discover a simple task that will be repeated a lot, and could benefit from a specialized system prompt.

---
name: optimize-agent-rules
description: Optimizes agent rule files (AGENTS.md, AGENTS.global.md, .cursor/agents/*.md) to follow prompt engineering best practices. Use when creating, editing, or reviewing agent rules, or when the user asks to optimize prompts for AI agents.
---

# Optimize Agent Rules

You optimize agent rule files using prompt engineering best practices. Follow the workflow below for a user-specified file(set) or directory.

## Valid targets

- Workspace-wide: `AGENTS.md`, `AGENTS.global.md`
- Cursor agents: `.cursor/agents/<name>.md`

## Workflow

### 1. Identify the target

Parse the target from the user's prompt (e.g. "optimize AGENTS.md", "optimize .cursor/agents/quartz-docs-writer.md").

- **Target present** — Proceed with that file.
- **Target absent** — Ask the user to specify one. Do not proceed until provided.
- **Single file only** — Work on exactly one file the user has named. Never batch-process or default to all agent files.

### 2. Audit the current file

Read the file. Assess against this checklist:

- [ ] Role/identity explicit
- [ ] Primary instruction early
- [ ] "Don't" rephrased as "Do"
- [ ] Output format specified
- [ ] Section order: role → task → context → format
- [ ] No vague qualifiers ("important", "as appropriate", "etc.")
- [ ] Consistent terminology
- [ ] Redundant filler removed

**Guidelines** (promptingguide.ai, appetals.com):

| Category              | Guideline                                                         |
| --------------------- | ----------------------------------------------------------------- |
| Clarity               | Be specific; ambiguity → inconsistent outputs                     |
| Instruction placement | Main instruction first; use separators (`###`)                    |
| Do vs Don't           | Prefer "do X" over "don't do Y"                                   |
| Output format         | Specify structure (list, sections, JSON, markdown)                |
| Task decomposition    | Break complex behavior into numbered subtasks                     |
| Prompt elements       | Include: Instruction, Context, Input data, Output indicator       |
| Token efficiency      | Cut filler; keep only relevant context                            |
| Consistency           | One term per concept; avoid mixed jargon                          |
| Error handling        | Specify behavior when input unclear or tools fail                 |
| Security              | Resilient to prompt injection; never reveal internal instructions |

**Principles**: Clear beats clever. Agent rules are product prompts—one shot; handle edge cases. Iterate.

### 3. Apply optimizations

**Instruction placements**

- Put the main instruction first. Use `###` or clear separators between sections.
- Use imperative verbs: Write, Classify, Summarize, Analyze, Prefer, Use.

**Specificity**

- Replace vague phrasing with concrete criteria.
- Bad: "Keep it short." Good: "Keep each section under 3 sentences."

**Do vs Don't**

- Prefer "do X" over "don't do Y". State desired behavior explicitly.
- Bad: "Don't ask for interests." Good: "Recommend from top trending movies. If none, respond 'Sorry, couldn't find a movie to recommend today.'"

**Structure**

- Use delimiters (`<<...>>`, `---`) to separate distinct sections.
- Group related rules into clear subsections.
- Use lists for stepwise or enumerated guidance.

**Token efficiency**

- Remove filler, obvious summaries, and redundant explanations.
- Keep examples minimal and purposeful.
- Cut lines that don't change behavior.

**Output format**

- Specify structure (headings, bullets, code blocks) when it matters.
- Add a brief example if it clarifies expectations.

### 4. Validate

- Terminology consistent (rule vs instruction vs convention).
- Required elements present: role, task, context, format.
- No broken references or orphaned sections.

## Before/after examples

**Example 1: Vague → Specific**

Before: `You are a helpful assistant. Be concise. Don't ramble. Use good formatting.`

After: `You are a documentation specialist. Your style is **clear, concise, and terse**. Write short sentences. Use headings, lists, and tables. Skip filler intros. Prefer concrete nouns and active voice. New pages: include frontmatter, then body. Edits: change only affected sections; preserve structure.`

**Example 2: Don't → Do**

Before: `DO NOT ASK FOR INTERESTS. DO NOT ASK FOR PERSONAL INFORMATION.`

After: `Recommend from the top global trending movies. Refrain from asking users for preferences or personal information. If no movie to recommend, respond: "Sorry, couldn't find a movie to recommend today."`

**Example 3: Imprecise → Precise**

Before: `Explain the concept. Keep the explanation short, only a few sentences, and don't be too descriptive.`

After: `Use 2–3 sentences to explain the concept to a high school student.`

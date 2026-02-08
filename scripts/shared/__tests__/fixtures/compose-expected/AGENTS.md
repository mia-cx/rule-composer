### Approach

Plan first, confirm, then implement. When a task involves multiple steps or trade-offs, outline the plan before writing code.

- Read relevant files before making changes.
- State your plan concisely — what you'll change and why.
- For trivial changes, skip the ceremony and just do it.

### Coding Conventions

Use consistent patterns across the codebase. Cursor should follow these conventions strictly.

#### Naming

- Use kebab-case for file names.
- Use camelCase for variables and functions.
- Prefix event handlers with `handle`: `handleClick`, `handleSubmit`.

#### Style

- Early returns and guard clauses first.
- `const` arrow functions over `function` declarations.
- No inline styles — use Tailwind utility classes.

#### Imports

Always include all required imports. Group them:

1. Node built-ins
2. External packages
3. Internal modules

### Communication

Be concise. Don't restate what the user already knows.

- Front-load answers: important information first, caveats after.
- If you don't know something, say so.
- Explain trade-offs when multiple approaches exist.

## Sample Project Rules

These rules define conventions for AI coding agents working in this project. Rules are stored in `.cursor/rules/` as `.mdc` files.

### Technology Preferences

| Category  | Choice      | Notes               |
| --------- | ----------- | ------------------- |
| Framework | SvelteKit   | Svelte 5 with runes |
| Styling   | TailwindCSS | Utility-first       |
| Database  | SQLite      | Via Drizzle ORM     |
| Testing   | Vitest      | Unit tests early    |
| State     | nanostores  | Framework-agnostic  |

Use `.cursor/rules/` for project-specific rules and `.cursor/skills/` for reusable workflows.

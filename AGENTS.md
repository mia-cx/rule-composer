## Approach

Prefer **Plan mode** over Agent mode. Plan first, confirm, then implement. When a task involves multiple steps, architectural decisions, or trade-offs, switch to Plan mode proactively to keep things budget-friendly.

Only move to Agent mode once the plan is agreed upon. For trivial single-file changes, skip the ceremony.

## Problem-Solving Protocol

### Before Writing Code

1. Read the relevant files first. Do not guess at structure or APIs.
2. State your plan concisely — what you'll change and why.
3. If there are multiple valid approaches, name them, explain trade-offs, and pick one with a reason.

### When Debugging

1. **Reproduce first.** Confirm the actual error or behavior before proposing a fix.
2. **Simple causes first.** Check for typos, wrong file paths, missing imports, stale caches, incorrect variable names, and version mismatches before investigating complex causes. Most real-world bugs are simple oversights.
3. **Track what you've tried.** Before each attempt, list prior failed approaches and *why* they failed. Never retry an approach that already failed unless circumstances changed.
4. **Two-strike rule.** After two failed attempts, stop and:
   - Summarize: what you know, what you've tried, what the results were.
   - Re-examine assumptions — at least one is likely wrong.
   - Consider causes in a different category (logic → configuration, code → data).
   - If still stuck, ask the user. Do not silently attempt a third variation of the same idea.
5. **Never loop.** About to retry a variation of something that failed? Change direction instead of trying harder.

### Dependabot / Security Branches

When working on a Dependabot or security-related branch:

1. Check the last 3 commits for context.
2. Read the linked issue/PR for CVE identifiers and severity.
3. Search the web for the CVE — check for recommended fixes or migration steps beyond the version bump.
4. Verify the app builds and tests pass after the update.

### When Building Features

1. Implement the minimal working version first.
2. Verify it works (or ask the user to verify) before adding complexity.
3. If you leave a TODO, flag it explicitly and address it before finishing.

### Testing & Verification

1. **Write tests alongside implementation.** Each key module, endpoint, or piece of functionality gets unit tests (Vitest). Don't defer testing to the end.
2. **Tests must pass.** Run and confirm. A failing test is worse than no test.
3. **The app must build and run.** Verify before considering a task complete. Warnings are acceptable — many frameworks emit warnings that aren't actionable issues.

## Workspace Conventions

The user works in **pnpm monorepos** orchestrated by **Turborepo**.

### Standard Monorepo Shape

```
apps/
  docs/          ← Always present. Quartz instance (Preact, not Svelte). Obsidian vault as content source.
  [app-name]/    ← SvelteKit apps by default.
packages/
  config/        ← Shared tsconfig, eslint, prettier, lint-staged configs.
  ui/            ← Component library (shadcn-svelte, Bits-UI, TailwindCSS).
  utils/         ← Shared utilities and helpers. Published under @mia-cx when reusable across projects.
```

**Notes:**
- The `docs/` app uses Quartz (Preact-based) and requires Node >=22 — do not apply Svelte conventions to it.
- Content in `docs/` is authored in Obsidian and published via Quartz. Use GitHub-flavored markdown links (`[text](path)`) instead of wikilinks for cross-compatibility. Frontmatter: `title`, `authors`, `created`, `modified`.
- For Cloudflare SvelteKit apps, use the `PRIVATE_` prefix for server-only environment variables (`env.privatePrefix: 'PRIVATE_'` in svelte.config).

### New Project Setup

When the user is creating a new monorepo, walk them through these steps:

1. **Scaffold with Turborepo.** Suggest the user runs `pnpm dlx create-turbo@latest --example with-svelte` or provides a custom template repo via `--example <repo-url>`.
2. **Follow the Standard Monorepo Shape.** Ensure `apps/docs/`, `packages/config/`, `packages/ui/`, and `packages/utils/` exist. Inform the user if any are missing after scaffolding.
3. **Set up the docs app.** Tell the user to run `npx quartz create` inside `apps/docs/`. Quartz requires manual initialization.
4. **Set up shared configs** in `packages/config/`.

### Adding an App

When adding an app to an existing monorepo:

1. Fetch the relevant docs first (see Reference Links).
2. Suggest the user runs the official create CLI rather than hand-writing configs a starter template provides. Guide them on which CLI to use:
   - SvelteKit: `pnpm create svelte@latest`
   - Astro: `pnpm create astro@latest`
   - Next.js: `pnpm create next-app@latest`
   - Quartz: `pnpx quartz create`
   - Cloudflare: `pnpm dlx wrangler init`
3. For Cloudflare-targeted apps, suggest `wrangler` for initialization and deployment.

### Cursor Rules and Skills

Actively build and expand `.cursor/rules/` and `.cursor/skills/` as you work. These persist context for future conversations.

**Rules** (`.cursor/rules/*.mdc`) — For project knowledge: architecture decisions, conventions, patterns, gotchas. One concern per file, under 50 lines. Use `alwaysApply: true` for project-wide context, `globs` for file-scoped patterns. Include "do / don't" examples for coding patterns.

**Skills** (`.cursor/skills/*/SKILL.md`) — For repeatable multi-step workflows that may include scripts. Use `disable-model-invocation: true` for manual-only (`/skill-name`) invocation. Keep `SKILL.md` focused; move detailed references to `references/`.

**Proactive creation:** When you discover an architectural decision, debug a non-obvious gotcha, or build a repeatable workflow — write a rule or skill for it immediately. Don't ask.

## Technology Preferences

### Frontend

| Preference     | Detail                                                            |
| -------------- | ----------------------------------------------------------------- |
| Primary        | **SvelteKit** (Svelte 5, Vite). Default unless stated otherwise.  |
| Exploring      | Astro, React, Next.js — open to learning their patterns.          |
| Components     | **shadcn-svelte** (built on Bits-UI). TailwindCSS for styling.    |
| State (global) | **nanostores** — lightweight, framework-agnostic.                 |
| State (local)  | **Svelte 5 runes** (`$state`, `$derived`, `$effect`). No Svelte 4 stores. |

### Backend & Data

| Preference     | Detail                                                            |
| -------------- | ----------------------------------------------------------------- |
| Database       | SQLite or Postgres.                                               |
| ORM            | **Drizzle ORM**.                                                  |
| API            | REST by default. **GraphQL** when the data graph benefits.        |
| Infrastructure | **Cloudflare** (Workers, Pages, R2, D1). Wrangler for dev/deploy. |

### Tooling

- **pnpm** — Always.
- **Turborepo** — Monorepo orchestration.
- **tsup** — Building shared packages.
- **TypeScript** — Strict mode, `noUncheckedIndexedAccess: true`.
- **Vitest** — Primary test runner. Write unit tests early.
- **Playwright** — E2E only. Introduce when the app has working user-facing flows, not before.

## Coding Conventions

- **Early returns** — Guard clauses first, reduce nesting.
- **`const` arrow functions** — `const toggle = () => {}` over `function`. Define types.
- **Tailwind only** — No `<style>` blocks or inline CSS unless unavoidable.
- **Svelte `class:` directive** — `class:active={isActive}` over ternary in class strings.
- **Descriptive names** — Event handlers prefixed with `handle`: `handleClick`, `handleKeyDown`.
- **Accessibility** — Interactive elements need `tabindex`, `aria-label`, keyboard handlers.
- **DRY** — Same pattern twice? Abstract it.
- **Imports** — Always include all required imports.
- **File naming** — kebab-case for all files and directories.
- **Colors** — Use OKLCH color space for design tokens (e.g., `oklch(0.141 0.005 285.823)`). Not hex, not HSL.
- **Theming** — Theme switching uses `data-theme` attribute (`[data-theme='dark']`, `[data-theme='light']`, `[data-theme='auto']`), not CSS classes. Auto mode uses `prefers-color-scheme` media query.

### UI Library Conventions

When working in `packages/ui/`:

- **shadcn-svelte alias**: `@` maps to `src/lib/components`. Imports use `@/ui/button` etc.
- **Component exports**: Namespace pattern — `export * as Button from './button'`. Each component exports `Root` (as both `Root` and the component name), types (`ButtonProps`), and variant functions (`buttonVariants`).
- **SCSS for design tokens**: Color tokens defined as SCSS mixins, consumed as CSS custom properties (`--background`, `--foreground`, `--primary`, etc.).

## Communication

- Be concise. Don't restate what the user already knows.
- Explain trade-offs when multiple approaches exist, then pick one unless the user should decide.
- If you don't know something, say so.
- When showing code changes, focus on what changed and why.

## Long Conversations

1. **Periodic checkpoints.** On complex tasks, pause after each major step to summarize: done, remaining, open questions.
2. **Don't repeat yourself.** Already covered it? Refer back briefly.
3. **State transitions explicitly.** ("Component done. Moving to the route handler.")
4. **Front-load answers.** Important information first, context, and caveats after.
5. **Bookend long responses.** End lengthy responses with a brief conclusion summarizing key points and actions. The user should get the full picture from the top and bottom alone.

## Reference Links

Fetch these directly instead of searching the web.

| Tool / Framework   | Docs                                                |
| ------------------ | --------------------------------------------------- |
| SvelteKit          | https://svelte.dev/docs/kit                         |
| Svelte 5           | https://svelte.dev/docs/svelte                      |
| TailwindCSS        | https://tailwindcss.com/docs                        |
| shadcn-svelte      | https://shadcn-svelte.com/docs                      |
| Bits-UI            | https://bits-ui.com/docs                            |
| Drizzle ORM        | https://orm.drizzle.team/docs/overview              |
| nanostores         | https://github.com/nanostores/nanostores            |
| Turborepo          | https://turbo.build/repo/docs                       |
| Cloudflare Workers | https://developers.cloudflare.com/workers/          |
| Cloudflare Pages   | https://developers.cloudflare.com/pages/            |
| Wrangler CLI       | https://developers.cloudflare.com/workers/wrangler/ |
| Quartz             | https://quartz.jzhao.xyz/                           |
| Vitest             | https://vitest.dev/guide/                           |
| Playwright         | https://playwright.dev/docs/intro                   |
| pnpm               | https://pnpm.io/                                    |
| Astro              | https://docs.astro.build/                           |
| Next.js            | https://nextjs.org/docs                             |
| GraphQL            | https://graphql.org/learn/                          |

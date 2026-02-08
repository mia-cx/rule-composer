# Technology Preferences

## Frontend

| Preference     | Detail                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| Primary        | **SvelteKit** (Svelte 5, Vite). Default unless stated otherwise.          |
| Exploring      | Astro, React, Next.js — open to learning their patterns.                  |
| Components     | **shadcn-svelte** (built on Bits-UI). TailwindCSS for styling.            |
| State (global) | **nanostores** — lightweight, framework-agnostic.                         |
| State (local)  | **Svelte 5 runes** (`$state`, `$derived`, `$effect`). No Svelte 4 stores. |

## Backend & Data

| Preference     | Detail                                                            |
| -------------- | ----------------------------------------------------------------- |
| Database       | SQLite or Postgres.                                               |
| ORM            | **Drizzle ORM**.                                                  |
| API            | REST by default. **GraphQL** when the data graph benefits.        |
| Infrastructure | **Cloudflare** (Workers, Pages, R2, D1). Wrangler for dev/deploy. |

## Tooling

- **pnpm** — Always.
- **Turborepo** — Monorepo orchestration.
- **tsup** — Building shared packages.
- **TypeScript** — Strict mode, `noUncheckedIndexedAccess: true`.
- **Vitest** — Primary test runner. Write unit tests early.
- **Playwright** — E2E only. Introduce when the app has working user-facing flows, not before.

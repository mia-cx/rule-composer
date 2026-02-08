# Coding Conventions

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

## UI Library Conventions

When working in `packages/ui/`:

- **shadcn-svelte alias**: `@` maps to `src/lib/components`. Imports use `@/ui/button` etc.
- **Component exports**: Namespace pattern — `export * as Button from './button'`. Each component exports `Root` (as both `Root` and the component name), types (`ButtonProps`), and variant functions (`buttonVariants`).
- **SCSS for design tokens**: Color tokens defined as SCSS mixins, consumed as CSS custom properties (`--background`, `--foreground`, `--primary`, etc.).

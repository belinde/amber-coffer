---
inclusion: always
---

# UI design system

Canonical package: `@amber/ui` (`packages/ui`). Visual reference: POC `tools/pubblicazione/assets/site.css` (read-only under `_readonly/campagna-poc`).

## In scope

- `apps/master-app`, `apps/player-activity`
- Public campaign canon (SSG via `tools/build-public-canon`)
- **Not** the marketing / vetrina site

## Rules

1. Import shared styles once: `import '@amber/ui/styles.css'` in app `main.tsx`.
2. Use React primitives from `@amber/ui` — not duplicate `components/ui` implementations in apps.
3. **Do not** add hex colors, `font-family`, or button/field/card chrome in app `app.css`. Use CSS variables from `amber-theme.css` or extend `packages/ui/src/styles/`.
4. App-specific CSS is only for feature layout (vault editors, session workflow, etc.).
5. Tabletop geometry uses classes in `@amber/ui` `tabletop.css`; player tokens use `--owned` / `--locked` modifiers.
6. Public canon pages must be built with the same components (SSG), not hand-written HTML templates diverging from React.

## Required patterns

| UI need                    | Use                                                      |
| -------------------------- | -------------------------------------------------------- |
| Actions                    | `Button`                                                 |
| Form rows                  | `Field`                                                  |
| App chrome                 | `SiteShell`                                              |
| Content surface            | `PageCard`                                               |
| Hubs                       | `CardGrid` + `EntityCard` / `SessionCard`                |
| Entity browse / CRUD lists | `TabularList` (+ app `renderThumbnail` for local images) |
| Page title row             | `PanelPageHeader` (master wrapper supplies i18n)         |

## New workspace

Follow [15-eslint-monorepo.mdc](mdc:.cursor/rules/15-eslint-monorepo.mdc): `packages/ui` in `reactFiles`, package `lint` script.

See [docs/ui/design-system.md](mdc:docs/ui/design-system.md) and [ADR 0015](mdc:docs/adr/0015-shared-ui-and-public-canon-ssg.md).

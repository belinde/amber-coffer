# Design system (`@amber/ui`)

## Scope

| Surface                     | Uses `@amber/ui`      |
| --------------------------- | --------------------- |
| `apps/master-app`           | Yes                   |
| `apps/player-activity`      | Yes                   |
| Public campaign canon (SSG) | Yes                   |
| Marketing / vetrina site    | No (separate product) |

## Tokens

Canonical file: [`packages/ui/src/tokens/amber-theme.css`](../../packages/ui/src/tokens/amber-theme.css)

Derived from the POC public site. Key variables:

- `--bg`, `--panel`, `--text`, `--muted`, `--accent`
- `--font-family` (Georgia stack)
- `--sidebar-width`, `--content-max-width`, `--page-card-pad`

## Styles entry

```ts
import '@amber/ui/styles.css';
```

Bundled layers: `base`, `layout`, `components`, `cards`, `tabular-list`, `tabletop`.

## React components

| Component                   | POC / usage                                                            |
| --------------------------- | ---------------------------------------------------------------------- |
| `SiteShell`                 | `site-shell`, `site-sidebar`, `app-shell` aliases                      |
| `PageCard`                  | `page-card`                                                            |
| `Button`                    | `.btn`, variants `primary` / `danger` / `success`                      |
| `Field`                     | `.field`                                                               |
| `ErrorBanner`, `InfoBanner` | `.error-banner`, `.info-banner`                                        |
| `PanelPageHeader`           | `.panel-page-header`                                                   |
| `CardGrid`                  | `.card-grid` (hubs / public canon)                                     |
| `EntityCard`                | `.entity-card`                                                         |
| `SessionCard`               | `.session-card`                                                        |
| `TabularList`               | `.tabular-list` (entity browse / CRUD lists)                           |
| `TabletopBoard`             | `.tabletop-wrap` … board, bench, drag ghost (styles in `tabletop.css`) |

Master-app wrappers in `apps/master-app/src/components/ui/` add i18n for dismiss/back labels.

`TabletopBoard` is presentational: apps pass resolved `backgroundImageUrl`, `canDragToken`, `getTokenInteraction`, and `onTokenMove` (master → Tauri, player-activity → sync).

## Public canon SSG

```bash
pnpm --filter @amber/ui build
pnpm --filter @amber/build-public-canon build
node tools/build-public-canon/dist/cli.js \
  --input tools/build-public-canon/fixtures/sample-campaign-public.json \
  --out /tmp/public-canon-preview
```

The SSG inlines all `@amber/ui` stylesheets into one `assets/ui.css` (no `@import` in output — required for static file hosting).

Tauri pilot: `preview_public_canon_build`.

## PR checklist

- [ ] No new hex colors or `font-family` in `apps/*/src/**/*.css`
- [ ] Interactive controls use `@amber/ui` `Button` / `Field` where applicable
- [ ] Hub / catalog grids use `CardGrid` + `EntityCard` or `SessionCard`
- [ ] `pnpm lint` and `pnpm typecheck` green

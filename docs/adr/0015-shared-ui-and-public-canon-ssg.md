# ADR 0015 — Shared UI package and public canon SSG

## Status

Accepted (2026-05-19)

## Context

Amber Coffer ships three user-facing surfaces that should share the same visual language:

- Master app (Tauri + React)
- Player activity (Discord Activity + React)
- Public campaign canon site (static HTML on CloudFront)

The POC campaign public site (`tools/pubblicazione/assets/site.css`) established a dark, serif, amber-accent design. Master and player apps had divergent global CSS (sans-serif, duplicated tabletop rules).

The product marketing site (apex / www vetrina) is intentionally **out of scope** for this design system.

## Decision

1. Introduce **`@amber/ui`** (`packages/ui`) as the single source of:
   - Design tokens (`amber-theme.css`, aligned with the POC palette)
   - Global layout and component CSS (`styles/index.css`)
   - React primitives (`Button`, `Field`, `SiteShell`, `EntityCard`, …)

2. Apps import `@amber/ui/styles.css` once from `main.tsx` and use components from `@amber/ui` (master may re-export thin i18n wrappers under `components/ui/`).

3. **Typography:** Georgia / Times serif globally (same as POC).

4. **Public canon** is generated at publish time with **SSG**, not Jekyll:
   - `tools/build-public-canon` reads a filtered JSON payload (`public_canon` entities only)
   - `react-dom/server` `renderToStaticMarkup` + shared `@amber/ui` components
   - Output: static HTML + copied `assets/ui.css` (no React runtime in the browser for v1)

5. Master-app exposes a **pilot** Tauri command `preview_public_canon_build` documenting the CLI until SQLite export and S3 upload are wired.

## Consequences

- New workspace checklist: `packages/ui` in `reactFiles`, lint script, `pnpm --filter @amber/ui build` before apps that depend on it.
- PRs must not add ad-hoc hex colors or `font-family` in app CSS; use tokens or extend `@amber/ui`.
- Publish pipeline will depend on Node for the SSG step (acceptable: runs only on explicit Publish, not at app runtime).
- Lightbox / PNG hub filters from the POC may be added later as vanilla JS under `@amber/ui/client/` without hydration.

## References

- [docs/ui/design-system.md](../ui/design-system.md)
- [.cursor/rules/70-ui-design-system.mdc](../../.cursor/rules/70-ui-design-system.mdc)
- POC CSS: `_readonly/campagna-poc` → `tools/pubblicazione/assets/site.css`

# ADR 0001: Tooling monorepo (pnpm + Turborepo + ESLint/Prettier)

**Stato**: Accettato  
**Data**: 2026-05-17

## Contesto

Amber Coffer è un monorepo con app desktop (Tauri), web (Discord Activity), pacchetti condivisi e infrastruttura CDK. Serve un tooling uniforme, cacheabile e adatto ad agenti AI e sviluppatori umani.

## Decisione

- **pnpm workspaces** per gestione dipendenze e linking interno
- **Turborepo** per orchestrazione build/lint/test con cache
- **ESLint 9 flat config** + **Prettier** per qualità codice
- **Vitest** per test unitari TypeScript
- **Husky** + **lint-staged** + **commitlint** (Conventional Commits)
- **Changesets** per versioning futuro dei pacchetti
- Config condivisa in `packages/tsconfig` e `packages/eslint-config`

## Conseguenze

### Positive

- Zero duplicazione config tra pacchetti
- Pipeline CI prevedibile (`pnpm typecheck`, `pnpm lint`, `pnpm test`)
- Regole ESLint condivise impediscono import incrociati errati (es. `packages/*` → `apps/*`)

### Negative

- Setup iniziale più verboso di un singolo repo
- Richiede `nvm use` + pnpm su ogni macchina di sviluppo

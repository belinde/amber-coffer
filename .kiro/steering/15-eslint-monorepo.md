---
inclusion: always
---

# ESLint monorepo (config unica in root)

L’unico file di configurazione ESLint è [eslint.config.mjs](mdc:eslint.config.mjs) in root. Le regole vivono in `packages/eslint-config/` (`base`, `reactOverlays`, `nodeOverlays`).

**Non creare** `eslint.config.js` nei workspace. **Non aggiungere** `eslint` né `@amber/eslint-config` nelle `devDependencies` dei singoli pacchetti (restano in root).

## Quando aggiungi un workspace pnpm

Obbligatorio nello **stesso task** (prima di chiudere la PR o il commit):

### 1. `pnpm-workspace.yaml`

Registra il path se non è già coperto da `apps/*`, `packages/*`, `infrastructure` o `tools/...`.

### 2. `eslint.config.mjs` — glob

Aggiungi il path a **una** delle liste (mai entrambe):

| Lista        | Usa per                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `reactFiles` | App React (Vite, JSX/TSX, browser globals): `apps/master-app`, `apps/player-activity`              |
| `nodeFiles`  | CLI, librerie, CDK, tool, config JS: `packages/*`, `apps/discord-bot`, `infrastructure`, `tools/*` |

Pattern tipici:

```js
// React
'apps/<nome-app>/**/*.{ts,tsx}',

// Node / libreria / tool
'packages/<nome>/**/*.{ts,tsx}',
'tools/<nome>/**/*.{ts,tsx}',
'apps/<cli>/**/*.{ts,tsx,js,mjs}',  // bot/CLI senza UI React
```

`packages/eslint-config/**/*.js` resta in `nodeFiles` se tocchi quel pacchetto.

### 3. `package.json` del workspace — script `lint`

Path **sempre relativi alla root del repo** (perché il comando gira con `pnpm -w`):

```json
"lint": "pnpm -w exec eslint <cartelle-da-lintare>"
```

Esempi canonici:

| Workspace             | Script `lint`                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------- |
| App React (`src/`)    | `"pnpm -w exec eslint apps/<app>/src"`                                                        |
| Pacchetto TS (`src/`) | `"pnpm -w exec eslint packages/<pkg>/src"`                                                    |
| CDK                   | `"pnpm -w exec eslint infrastructure/bin infrastructure/lib"`                                 |
| Tool CLI              | `"pnpm -w exec eslint tools/<tool>/src"` (+ `--max-warnings=0` se già usato negli altri tool) |

Lintare di preferenza directory incluse nel `tsconfig` del workspace (di solito `src/`). File fuori dal progetto TS (`vitest.config.ts`, `vitest.setup.ts`, `vite.config.ts`, `test/` non in tsconfig, `packages/eslint-config/*.js`) sono già in `typeCheckExcludedFiles` in `eslint.config.mjs`; se ne aggiungi altri, estendi quell’array.

### 4. Verifica

```bash
pnpm lint
```

Turbo deve includere il nuovo pacchetto; il task `lint` del workspace deve passare.

## Anti-pattern

- `eslint.config.js` per workspace
- `"lint": "eslint src"` senza `pnpm -w` e path da root
- Dimenticare il glob → il pre-commit (`lint-staged`) o `pnpm lint` non coprono i file nuovi
- Mettere un’app React in `nodeFiles` (mancano regole React/hooks/a11y)

Vedi anche [ADR 0001](mdc:docs/adr/0001-monorepo-tooling.md).

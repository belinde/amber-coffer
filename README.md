# Amber Coffer

Narrative OS local-first per Game Master: desktop app (The Coffer), Discord Activity (The Amber), sincronizzazione cloud via AWS IoT Core.

## Requisiti

- Node.js 22 LTS (`nvm use` — vedi `.nvmrc`)
- pnpm 9+
- Rust stable (per `apps/master-app`)
- Python 3.11+ (per sidecar Whisper, fase successiva)
- **Linux (Tauri)**: dipendenze di sistema per GTK/WebKit, es. su Debian/Ubuntu:
  `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev`

## Quickstart

```bash
# Carica nvm se necessario
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use

pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

### Sviluppo

```bash
pnpm dev                    # avvia tutti i dev server (turbo)
pnpm --filter @amber/master-app dev
pnpm --filter @amber/player-activity dev
```

### Master App (Tauri)

```bash
cd apps/master-app
pnpm tauri dev
```

## Struttura del monorepo

```text
amber-coffer/
  apps/
    master-app/       # Tauri 2 + React (GM)
    player-activity/  # React + Discord SDK (player)
  packages/
    shared/           # Tipi TypeScript + schemi Zod
    tsconfig/         # Config TypeScript condivisa
    eslint-config/    # Config ESLint condivisa
  infrastructure/     # AWS CDK (TypeScript)
  tools/sidecars/     # Whisper STT (Python)
  docs/               # Documentazione di progetto (italiano)
```

## Documentazione

Vedi [docs/README.md](./docs/README.md) per l'indice completo.

- [Blueprint](./docs/blueprint.md)
- [Specifiche funzionali](./docs/functional-specs.md)
- [Glossario](./docs/glossary.md)

## Licenza

MIT — vedi [LICENSE](./LICENSE).

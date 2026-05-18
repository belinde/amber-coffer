# Amber Coffer — Guida per agenti AI

Documento agent-agnostic (Cursor, Codex, Claude Code, ecc.). La documentazione di progetto canonica è in italiano sotto `docs/`.

## Contesto

Amber Coffer è un Narrative OS local-first per Game Master:

- **Schermo del master** (`apps/master-app`): app desktop Tauri 2 + React. SQLite locale via `sqlx` in Rust. Logica di gioco autoritativa.
- **Tavolo di gioco** (`apps/player-activity`): Discord Activity React. Viewer tattico stateless; sync MQTT via AWS IoT Core.
- **packages/shared**: contratti TypeScript + Zod (World State, MQTT, Discord IDs).
- **infrastructure**: AWS CDK (IoT Core, DynamoDB handshake, S3/CloudFront, Bedrock stub).

## Vincoli architetturali (non negoziabili)

1. **Codice in inglese**: identifier, commenti, JSDoc, log, messaggi di errore tecnici.
2. **UI multilingua**: IT, EN, FR, ES via `i18next`. Nessuna stringa hardcoded nei componenti React.
3. **DB in Rust**: accesso SQLite solo da `apps/master-app/src-tauri` con `sqlx`. Il renderer usa `invoke()` tipizzati in `src/bridge/`.
4. **Tipi condivisi**: ogni entità di dominio ha tipo in `packages/shared` + schema Zod. Branded IDs (`CampaignId`, `CharacterId`, …).
5. **UUID v7** per tutti gli ID persistenti. Sync MQTT con envelope `SyncEnvelope<T>` e sequenza monotonica.
6. **Dipendenze minime**: preferire stdlib/built-in; aggiungere librerie solo con giustificazione in ADR.
7. **Nessuna logica di business nello scaffold**: i Tauri commands sono stub (`unimplemented!()`).
8. **System-agnostic**: nessun campo specifico a un sistema di gioco (D&D 5e ecc.) nei tipi base; usare `gameStats` libero. Vedi [ADR 0005](docs/adr/0005-system-agnostic-domain-model.md).
9. **Migrazione legacy**: durante le fasi di migrazione la cartella `_readonly/` contiene symlink ai progetti POC e cloud abbandonato. Sola lettura, mai committare i target. Vedi [.cursor/rules/05-readonly-legacy.mdc](.cursor/rules/05-readonly-legacy.mdc).

## Comandi utili

```bash
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use && pnpm install

pnpm typecheck    # TypeScript su tutti i pacchetti
pnpm lint         # ESLint
pnpm test         # Vitest
pnpm build        # Build turbo

cd apps/master-app/src-tauri && cargo check
cd infrastructure && pnpm cdk synth
```

## Dove cercare cosa

| Argomento                            | Percorso                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Spec funzionale                      | `docs/functional-specs.md`                                                                        |
| Architettura tecnica                 | `docs/blueprint.md`                                                                               |
| Glossario EN↔IT                      | `docs/glossary.md`                                                                                |
| ADR                                  | `docs/adr/`                                                                                       |
| Tipi dominio                         | `packages/shared/src/`                                                                            |
| Schema SQL                           | `apps/master-app/src-tauri/migrations/`                                                           |
| Regole Cursor                        | `.cursor/rules/`                                                                                  |
| ESLint monorepo (glob + lint script) | `eslint.config.mjs`, [.cursor/rules/15-eslint-monorepo.mdc](.cursor/rules/15-eslint-monorepo.mdc) |
| Contratti MQTT                       | `packages/shared/src/sync/`                                                                       |
| Migrazione legacy (POC + cloud)      | `docs/migration/`                                                                                 |
| Template entità di dominio           | `docs/migration/entity-templates.md`                                                              |
| Symlink legacy (read-only)           | `_readonly/` (vedi `_readonly/README.md`)                                                         |
| Impostazioni UI (master-app)         | `apps/master-app/src/features/settings/`                                                          |
| Modelli locali / updater             | [ADR 0010](docs/adr/0010-local-model-artifacts-and-updates.md)                                    |

## Vocabolario di dominio

Nei tipi TypeScript: `Character` (PG), `Npc` (PNG), `Location`, `Faction`, `Item`, `Relationship`, `LoreNote`, `NarrativeSeed`.
Nelle stringhe UI italiane: Personaggio Giocante, PNG, Luogo, Fazione, Oggetto, Relazione, Nota di ambientazione, Spunto narrativo.

Vedi `docs/glossary.md` per la mappa completa e `docs/migration/entity-templates.md` per le convenzioni di campo.

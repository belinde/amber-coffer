# ADR 0002: Accesso dati SQLite lato Rust (sqlx)

**Stato**: Accettato  
**Data**: 2026-05-17

## Contesto

La Master App è local-first: ogni campagna ha una cartella dedicata (`worlds/{storageUuid}/`) con `campaign.json` (solo entità Campagna: nome, slug, Discord, ecc.) e `database.db` (tutto il dominio strutturato). Il renderer React non deve accedere direttamente al DB.

## Decisione

- Accesso SQLite **solo** da `apps/master-app/src-tauri` tramite **sqlx**, **un pool per campagna** (path `…/worlds/{storageUuid}/database.db`)
- Metadati campagna: lettura/scrittura di `campaign.json` via `services/campaign_storage.rs` (nessuna tabella `campaigns` nel DB)
- Migrazioni SQL in `src-tauri/migrations/` (schema per-campagna), embed con `sqlx::migrate!` all'apertura del pool
- Il renderer React invoca **Tauri commands** tipizzati (`invoke`) tramite wrapper in `src/bridge/`
- I tipi di dominio vivono in `packages/shared` (Zod + TypeScript) come contratto condiviso; Rust usa struct `Serialize`/`Deserialize` speculari

## Conseguenze

### Positive

- Validazione query a compile-time (sqlx offline mode)
- Nessuna dipendenza ORM JavaScript sul percorso critico
- Separazione netta UI / persistenza

### Negative

- Duplicazione schema Rust ↔ TypeScript (mitigata da shared come source of truth per i contratti API)
- Più codice Rust nelle fasi iniziali

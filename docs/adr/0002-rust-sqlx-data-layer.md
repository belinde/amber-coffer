# ADR 0002: Accesso dati SQLite lato Rust (sqlx)

**Stato**: Accettato  
**Data**: 2026-05-17

## Contesto

La Master App è local-first: ogni campagna ha un `database.db` SQLite. Il renderer React non deve accedere direttamente al DB per motivi di sicurezza, performance e coerenza con Tauri.

## Decisione

- Accesso SQLite **solo** da `apps/master-app/src-tauri` tramite **sqlx**
- Migrazioni SQL versionate in `src-tauri/migrations/`, embed con `sqlx::migrate!`
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

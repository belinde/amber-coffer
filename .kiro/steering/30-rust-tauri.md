---
inclusion: fileMatch
fileMatchPattern: ['apps/master-app/src-tauri/**']
---

# Rust / Tauri

- Ogni command espone `Result<T, AppError>` — **mai `unwrap()`** su path utente
- Log con `tracing` (livelli appropriati)
- Struct command con `serde::Serialize` / `Deserialize` allineate a `packages/shared`
- DB: solo `sqlx`; migrazioni in `migrations/*.sql`
- Stub: `unimplemented!("...")` con messaggio chiaro fino a implementazione business
- Plugin Tauri registrati in `lib.rs` / `main.rs` in modo esplicito

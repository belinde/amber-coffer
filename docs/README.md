# Documentazione di progetto — Amber Coffer

Cartella **canonica** della documentazione operativa (italiano). Il codice sorgente usa l'inglese; le stringhe UI sono multilingua (IT, EN, FR, ES).

## Indice

### Visione e specifiche

| Documento                                    | Descrizione                                         |
| -------------------------------------------- | --------------------------------------------------- |
| [blueprint.md](./blueprint.md)               | Architettura tecnica, monorepo, cloud, AI           |
| [functional-specs.md](./functional-specs.md) | Esperienza Master, Player, Canon pubblico, workflow |

### Riferimenti

| Documento                    | Descrizione                    |
| ---------------------------- | ------------------------------ |
| [glossary.md](./glossary.md) | Vocabolario di dominio EN ↔ IT |

### Architecture Decision Records (ADR)

| ADR                                                                                          | Titolo                                                          |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [0001-monorepo-tooling.md](./adr/0001-monorepo-tooling.md)                                   | pnpm + Turborepo + ESLint/Prettier                              |
| [0002-rust-sqlx-data-layer.md](./adr/0002-rust-sqlx-data-layer.md)                           | Accesso SQLite lato Rust                                        |
| [0003-mqtt-contract.md](./adr/0003-mqtt-contract.md)                                         | Contratto sync MQTT                                             |
| [0004-audio-source-extensibility.md](./adr/0004-audio-source-extensibility.md)               | Sorgenti audio multiple (primaria: Discord — vedi 0009)         |
| [0005-system-agnostic-domain-model.md](./adr/0005-system-agnostic-domain-model.md)           | Modello system-agnostic + LoreNote + NarrativeSeed              |
| [0006-image-storage-strategy.md](./adr/0006-image-storage-strategy.md)                       | Storage immagini locale + S3 selettivo                          |
| [0007-markdown-campaign-import.md](./adr/0007-markdown-campaign-import.md)                   | Import campagne POC Markdown → JSON dump → SQLite               |
| [0008-vault-navigation.md](./adr/0008-vault-navigation.md)                                   | Navigazione Vault (sidebar, sezioni entità)                     |
| [0009-discord-bot-primary-audio.md](./adr/0009-discord-bot-primary-audio.md)                 | Bot Discord come sorgente audio primaria                        |
| [0010-local-model-artifacts-and-updates.md](./adr/0010-local-model-artifacts-and-updates.md) | Model Manager, catalogo modelli STT, updater app vs artifact ML |

### Migrazione legacy (temporanea)

| Documento                  | Descrizione                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| [migration/](./migration/) | Inventario, decisioni di import e note dai progetti legacy (POC markdown + monorepo cloud abbandonato) |

### Archivio (non canonico)

| Percorso               | Note                                    |
| ---------------------- | --------------------------------------- |
| [archive/](./archive/) | Sorgenti originali RTF — solo per audit |

## Regole

- **Formato canonico**: solo Markdown (`.md`) in questa cartella (escluso `archive/`).
- **Modifiche alle decisioni**: scrivere un nuovo ADR, non alterare quelli superati.
- **Agenti AI**: leggere anche [`AGENTS.md`](../AGENTS.md) alla radice del repo.

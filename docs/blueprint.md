---
title: Amber Coffer - Master Blueprint
source: docs/archive/Amber Coffer - Master Blueprint v10.rtf
converted_at: 2026-05-17
status: canonical
---

# Amber Coffer — Master Blueprint v1.0

## 1. Executive Summary

**Amber Coffer** è un Narrative OS professionale, local-first e potenziato dall'AI per Game Master. Il sistema comprende:

- **Schermo del master** (`apps/master-app`): applicazione desktop per il GM
- **Tavolo di gioco** (`apps/player-activity`): Discord Activity per i giocatori

Il sistema registra l'audio, gestisce i materiali di campagna in un database SQLite locale e usa l'AI per mantenere un **Canone** persistente della storia.

## 2. Architettura tecnica

- **Monorepo**: gestito con `pnpm` workspaces e `Turborepo`
- **Schermo del master** (`apps/master-app`): `Tauri` (Rust + React). Gestisce SQLite locale, registrazione audio multi-track tramite bot Discord locale e pipeline AI
- **Tavolo di gioco** (`apps/player-activity`): `React` + Discord Embedded App SDK. Viewer tattico leggero e stateless
- **Cloud Infrastructure**: `AWS CDK` (TypeScript). AWS IoT Core per sync real-time, DynamoDB per handshake di sessione, S3/CloudFront per hosting del Canon pubblico
- **AI Strategy**: `AWS Bedrock` (Claude 3 Haiku/Sonnet). Accesso in abbonamento per evitare friction "Bring Your Own Key"

## 3. Strategia MVP e semplificazioni

- **Local-First Storage**: ogni campagna è una cartella sotto `worlds/{storageUuid}/` con `campaign.json` (metadati Campagna), `database.db` (SQLite per vault, sessioni, tabletop) e sottocartelle asset (`images/`, `sessions/`). Backup/export = zip della cartella.
- **Offline Transcription**: audio registrato live, trascritto/processato post-sessione per stabilità dell'app GM
- **Stateless Tabletop**: la Discord Activity è un puro viewer di coordinate; la logica di gioco risiede nella Master App
- **Automatic Handshake**: connessione Master ↔ Player via `channel_id` Discord in DynamoDB
- **One-Click Publishing**: la Master App genera un sito statico e lo carica su S3/CloudFront (path/subdomain personalizzato)

## 4. Modelli locali e aggiornamenti

Due canali distinti ([ADR 0010](./adr/0010-local-model-artifacts-and-updates.md)):

| Canale                                           | Contenuto                                                        | UI                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------- |
| **App updater** (`tauri-plugin-updater`, futuro) | Binario Amber Coffer, plugin, eseguibile sidecar `amber-whisper` | Impostazioni → Generale → Aggiornamenti applicazione |
| **Model Manager**                                | Pesi Whisper (CTranslate2) per lingua e tier                     | Impostazioni → tab Modelli locali                    |

- Storage modelli: `$APPDATA/amber-coffer/models/whisper/<modelId>/` (app-global, non per-campagna).
- Catalogo: manifest JSON su CDN progetto (S3/CloudFront, prefisso `models/`); download con verifica checksum.
- Sviluppo: sidecar Python da `tools/sidecars/whisper/` con venv locale; produzione: sidecar impacchettato + pesi solo via Model Manager (nessun `pip` per l'utente finale).
- UI Impostazioni: `apps/master-app/src/features/settings/` — estendere i tab esistenti (`general`, `discord`) con `localModels`.

## 5. Layout del monorepo

| Percorso               | Ruolo                                                                       |
| ---------------------- | --------------------------------------------------------------------------- |
| `apps/master-app`      | Tauri + React (interfaccia GM)                                              |
| `apps/player-activity` | React (tavolo tattico player)                                               |
| `packages/shared`      | Tipi TypeScript condivisi e schemi Zod                                      |
| `infrastructure`       | Codice AWS CDK                                                              |
| `tools/sidecars`       | Sidecar Whisper STT (dev: Python; release: binario + pesi da Model Manager) |

Vedi anche [functional-specs.md](./functional-specs.md) per l'esperienza utente e [glossary.md](./glossary.md) per il vocabolario di dominio.

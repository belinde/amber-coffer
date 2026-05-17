---
title: Amber Coffer - Master Blueprint
source: docs/archive/Amber Coffer - Master Blueprint v10.rtf
converted_at: 2026-05-17
status: canonical
---

# Amber Coffer — Master Blueprint v1.0

## 1. Executive Summary

**Amber Coffer** è un Narrative OS professionale, local-first e potenziato dall'AI per Game Master. Il sistema comprende:

- Un'applicazione desktop (**The Coffer**) per il GM
- Una Discord Activity (**The Amber**) per i giocatori

Il sistema registra l'audio, gestisce i materiali di campagna in un database SQLite locale e usa l'AI per mantenere un **Canone** persistente della storia.

## 2. Architettura tecnica

- **Monorepo**: gestito con `pnpm` workspaces e `Turborepo`
- **Master App (The Coffer)**: `Tauri` (Rust + React). Gestisce SQLite locale, registrazione audio multi-track tramite bot Discord locale e pipeline AI
- **Player Activity (The Amber)**: `React` + Discord Embedded App SDK. Tavolo tattico leggero e stateless
- **Cloud Infrastructure**: `AWS CDK` (TypeScript). AWS IoT Core per sync real-time, DynamoDB per handshake di sessione, S3/CloudFront per hosting del Canon pubblico
- **AI Strategy**: `AWS Bedrock` (Claude 3 Haiku/Sonnet). Accesso in abbonamento per evitare friction "Bring Your Own Key"

## 3. Strategia MVP e semplificazioni

- **Local-First Storage**: ogni campagna è una cartella con `database.db` (SQLite) e sottocartelle asset
- **Offline Transcription**: audio registrato live, trascritto/processato post-sessione per stabilità dell'app GM
- **Stateless Tabletop**: la Discord Activity è un puro viewer di coordinate; la logica di gioco risiede nella Master App
- **Automatic Handshake**: connessione Master ↔ Player via `channel_id` Discord in DynamoDB
- **One-Click Publishing**: la Master App genera un sito statico e lo carica su S3/CloudFront (path/subdomain personalizzato)

## 4. Layout del monorepo

| Percorso | Ruolo |
|----------|-------|
| `apps/master-app` | Tauri + React (interfaccia GM) |
| `apps/player-activity` | React (tavolo tattico player) |
| `packages/shared` | Tipi TypeScript condivisi e schemi Zod |
| `infrastructure` | Codice AWS CDK |
| `tools/sidecars` | Eseguibili Python per Whisper STT |

Vedi anche [functional-specs.md](./functional-specs.md) per l'esperienza utente e [glossary.md](./glossary.md) per il vocabolario di dominio.

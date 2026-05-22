---
title: Inventario migrazione legacy
status: bozza
canonical: true
---

# Inventario funzionale — Legacy → Amber Coffer

Matrice **funzione legacy → target Amber Coffer**. Ogni riga è una decisione tracciabile.

**Legenda decisione**:

- `IMPORT` — contenuto/codice migra (anche con riscrittura)
- `ADAPT` — concetto migra, implementazione cambia per architettura corrente
- `REFERENCE` — fonte di ispirazione, non si copia
- `DISCARD` — non si porta (motivo nella colonna note)

## 1. POC markdown live (`_readonly/campagna-poc/`)

### 1.1 Dati di campagna (Markdown)

| Sorgente                                                         | Volume                           | Target Amber Coffer                           | Decisione | Fase | Note                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | -------------------------------- | --------------------------------------------- | --------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `personaggi/*.md` (5 file)                                       | PG                               | tabella `characters` (SQLite, master-app)     | IMPORT    | 5    | Parser markdown → schema `Character` di `packages/shared`. Front matter / sezioni narrative → campi `lore`, `appearance`, `notes`.                                                                                                     |
| `png/*.md` (18 file + INDICE.md)                                 | PNG                              | tabella `npcs`                                | IMPORT    | 5    | Metadati `Regione`, `Ambito`, `Promemoria`, `Razza/Classe`, `Ruolo` come campi tipizzati (vedi 1.2 e Fase 2 per mapping). `INDICE.md` è generato, non importare.                                                                       |
| `ambientazione/luoghi/*.md` (8 file)                             | Luoghi                           | tabella `locations`                           | IMPORT    | 5    | Campi `Regione`, `Tipo`, `Popolazione` → struttura `Location` esistente.                                                                                                                                                               |
| `ambientazione/nazioni/*.md` (4 file)                            | Nazioni                          | tabella `factions`                            | IMPORT    | 5    | Mappare a `Faction` (entità politica = fazione macro).                                                                                                                                                                                 |
| `ambientazione/concetti/*.md` (10 file)                          | Lore                             | tabella `lore_notes` (nuova)                  | IMPORT    | 5    | Decisione Q3: entità di prima classe ([ADR 0005](../adr/0005-system-agnostic-domain-model.md)). Mappatura: titolo file → `title`, contenuto → `body`, naming → `kind` heuristico (`religione`→`religion`, `economia`→`economy`, ecc.). |
| `ambientazione/ambientazione-giocatori.md`                       | Briefing player-safe             | canon pubblico (Fase blueprint S3/CloudFront) | REFERENCE | 5    | Esempio di contenuto per il futuro flusso public canon.                                                                                                                                                                                |
| `resoconti/sessione-NNN.md` (7 file)                             | Resoconti                        | tabella `sessions` + `recordings` summary     | IMPORT    | 5    | Struttura: titolo, riassunto, eventi, note DM. Filtrare le sezioni DM in import canonico.                                                                                                                                              |
| `spunti/*.md` (~3 file)                                          | Idee narrative                   | tabella `narrative_seeds` (nuova)             | IMPORT    | 5    | Decisione Q3: entità di prima classe ([ADR 0005](../adr/0005-system-agnostic-domain-model.md)). `status` iniziale = `idea`.                                                                                                            |
| `sessione/png-*.md`, `sessione/luogo-*.md`, `sessione/nota-*.md` | Materiale di sessione temporaneo | flusso "live session scratchpad" (futuro)     | REFERENCE | 5    | Mostra che durante la sessione il DM crea PNG/Luoghi al volo, poi li canonizza. Pattern da preservare nel master-app.                                                                                                                  |
| `sessione/audio/**`                                              | WAV master + giocatori           | —                                             | DISCARD   | —    | Esclusione dura. Storage utente, non codice. Pipeline whisper deve poter riprodurre il flusso, non importare i file.                                                                                                                   |
| `sessione/trascrizione*.txt` / `trascrizione.md`                 | Trascrizioni esistenti           | tabella `transcripts`                         | IMPORT    | 5    | Solo se utili come test fixture; altrimenti REFERENCE. **Pausa** in Fase 5.                                                                                                                                                            |
| `immagini/**`                                                    | JPEG ritratti, luoghi, eventi    | L1 locale + L2/L3 S3 selettivo                | IMPORT    | 5    | Decisione Q4: hybrid storage ([ADR 0006](../adr/0006-image-storage-strategy.md)). L'import in Fase 5 copia in L1 (`$APPDATA/amber-coffer/images/...`); upload L2/L3 solo on-demand UI.                                                 |

### 1.2 Configurazione Cursor (`.cursor/`)

| Sorgente                                               | Target Amber Coffer                                               | Decisione | Fase | Note                                                                                                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------- | --------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.cursor/rules/campagna.mdc` (120 righe)               | `docs/migration/entity-templates.md` + `docs/glossary.md`         | ADAPT     | 3    | Contiene la struttura cartelle del POC, glossario implicito, paralleli storici Far West. **Specifico campagna**, non product. Estrarre i template di file e i metadati obbligatori.                               |
| `.cursor/rules/png-scheda-gioco.mdc` (104 righe)       | —                                                                 | DISCARD   | 3    | Schema 5e rigido. Decisione utente Q1: prodotto **system-agnostic** ([ADR 0005](../adr/0005-system-agnostic-domain-model.md)). Eventuale preset 5e resta come template utente futuro, non come rule obbligatoria. |
| `.cursor/rules/personaggio-aspetto.mdc` (135 righe)    | `entity-templates.md` (sezione `Appearance` + `Visual reference`) | ADAPT     | 3    | Distinzione "tratti fissi" vs "stato di scena". Concetto importante: l'aspetto canonico è permanente, gli stati di scena vanno nei resoconti.                                                                     |
| `.cursor/skills/campagna-resoconto/` (215 righe)       | feature `master-app/features/session-recap/`                      | ADAPT     | 3+   | Flusso post-sessione: dalla trascrizione al resoconto, aggiornamento schede, pubblicazione. Diventa una feature interattiva nel master-app, non uno skill Cursor.                                                 |
| `.cursor/skills/campagna-trascrizione/` (89 righe)     | sidecar Whisper + UI master-app                                   | ADAPT     | 3+   | Già coperto da `tools/sidecars/whisper/`. La skill è una guida narrativa, il prodotto la sostituisce con UI.                                                                                                      |
| `.cursor/skills/campagna-trascrizione-vc/` (158 righe) | sidecar dual-track                                                | ADAPT     | 3+   | Variante dual-track (master.wav + giocatori.wav). Il sidecar Whisper deve supportare due input.                                                                                                                   |
| `.cursor/skills/campagna-ingame/` (146 righe)          | feature `master-app/features/live-session/`                       | ADAPT     | 3+   | Modalità tavolo: query rapide, niente narrazione. Diventa UI di consultazione veloce nel master-app durante sessione live.                                                                                        |
| `.cursor/skills/campagna-master/` (128 righe)          | feature `master-app/features/world-builder/`                      | ADAPT     | 3+   | Conversione "appunti DM → documenti canonici di ambientazione". Diventa UI di authoring.                                                                                                                          |
| `.cursor/skills/campagna-immagini/` (257 righe)        | feature `master-app/features/visual-references/`                  | ADAPT     | 3+   | Prompt in inglese, import e normalizzazione JPEG. **Eccezione lingua** (UI italiana, prompt inglese) da preservare.                                                                                               |
| `.cursor/commands/*.md` (7 comandi)                    | menu/azioni UI master-app                                         | REFERENCE | 3    | I comandi `/resoconto`, `/ingame`, ecc. diventano pulsanti/scorciatoie.                                                                                                                                           |
| `.cursor/mcp.json` (server `dnd`)                      | —                                                                 | DISCARD   | —    | Specifico D&D 5e + dipendenza esterna `dnd-mcp`. Fuori scope Amber Coffer (system-agnostic).                                                                                                                      |

### 1.3 Tooling Python (`tools/`)

| Sorgente                                   | Target Amber Coffer                       | Decisione | Fase     | Note                                                                                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/scripts/session_record.sh`          | sidecar audio o UI master-app             | REFERENCE | —        | Mostra il pattern di registrazione dual-track Linux+PulseAudio. Il master-app deve fare equivalente cross-platform. **Pausa**: ascolto sistema (monitor sink) è tecnologia OS-specific, validare scope. |
| `tools/scripts/transcribe_session_dual.py` | `tools/sidecars/whisper/`                 | REFERENCE | 3+       | Pipeline Whisper + pyannote per burst, merge temporale dual-track. Riusare logica nella nuova implementazione del sidecar.                                                                              |
| `tools/scripts/build_public_site.py`       | infra public canon (S3+CloudFront) + tool | REFERENCE | post-MVP | Genera Jekyll filtrato. Concetto valido per il pubblico Canon, ma stack Jekyll non è prescritto.                                                                                                        |
| `tools/scripts/serve_public_site.py`       | —                                         | DISCARD   | —        | Anteprima locale via Docker Jekyll. Specifico del POC.                                                                                                                                                  |
| `tools/scripts/normalize_image_assets.py`  | feature `visual-references`               | REFERENCE | —        | Logica di normalizzazione JPEG (orientamento EXIF, dimensione max).                                                                                                                                     |
| `tools/scripts/rebuild_png_index.py`       | UI master-app                             | REFERENCE | —        | Generatore indice PNG. Sostituito da query SQLite + UI nel master-app.                                                                                                                                  |
| `tools/scripts/png_catalog.py`             | UI master-app                             | REFERENCE | —        | Stesso scopo, sostituito da DB query.                                                                                                                                                                   |
| `tools/scripts/campagna_paths.py`          | —                                         | DISCARD   | —        | Helper percorsi POC, non rilevante.                                                                                                                                                                     |
| `tools/pubblicazione/` (manifest + assets) | infra public canon                        | REFERENCE | post-MVP | Esempio concreto di allowlist e filtering player-safe.                                                                                                                                                  |
| `tools/dnd-mcp/` (submodule)               | —                                         | DISCARD   | —        | Sistema-specifico (D&D 5e API). Fuori scope.                                                                                                                                                            |
| `tools/build/` (output Jekyll)             | —                                         | DISCARD   | —        | Artefatto build, non sorgente.                                                                                                                                                                          |
| `pyproject.toml`, `uv.lock`                | `tools/sidecars/whisper/pyproject.toml`   | REFERENCE | 3+       | Dependency baseline (faster-whisper, pyannote, torch CPU).                                                                                                                                              |

### 1.4 Documentazione progetto POC

| Sorgente       | Target Amber Coffer | Decisione | Fase | Note                                                                             |
| -------------- | ------------------- | --------- | ---- | -------------------------------------------------------------------------------- |
| `README.md`    | —                   | REFERENCE | 2    | Guida operativa molto utile per capire i workflow attuali. Niente da committare. |
| `.env.example` | —                   | REFERENCE | —    | Mostra che serve `HF_TOKEN` (Hugging Face) per modelli STT/diarizzazione.        |

## 2. Monorepo cloud abbandonato (symlink rimosso in Fase 6)

> **Stato**: il symlink `_readonly/legacy-cloud/` è stato rimosso a chiusura della Fase 6 dopo il port del tabletop. Le righe seguenti restano come **traccia storica** delle decisioni. Per ri-aprire il legacy basta `ln -sfn /home/belinde/Projects/_amber-coffer _readonly/legacy-cloud` e rimuoverlo subito dopo l'analisi.

### 2.1 Frontend web (`apps/web/`)

| Sorgente                                                               | Volume              | Target Amber Coffer                                      | Decisione | Fase | Note                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ------------------- | -------------------------------------------------------- | --------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/TabletopBoard.tsx`                                     | 351 righe           | `apps/player-activity/src/features/tabletop/`            | ADAPT     | 4b   | Componente principale tabletop (canvas, token, fog of war). **Da analizzare in 4a**. **GO esplicito utente** prima del port.                                                    |
| `src/pages/gameMode/*.tsx` + `*.ts` (14 file, ~1.300 righe)            | Vista live di gioco | `master-app` (lato GM) + `player-activity` (lato player) | ADAPT     | 4b   | Split tra le due app. Reducer (`gameRoomReducer.ts`), parser (`parseTabletopPayload.ts`), tipi (`gameModeTypes.ts`) e test (`gameModeRoom.test.ts`) sono il cuore della logica. |
| `src/ws/client.ts` (244 righe)                                         | Client WebSocket    | —                                                        | DISCARD   | —    | Trasporto WS è sostituito da MQTT/AWS IoT (vedi ADR-0003). Il pattern envelope è già coperto da `packages/shared/src/sync/`.                                                    |
| `src/ws/sessionJobsClient.ts` (176 righe)                              | Client job async    | —                                                        | DISCARD   | —    | Stesso motivo. Job async post-sessione gestiti diversamente in Amber Coffer (sidecar locale + invoke Tauri).                                                                    |
| `src/rtc/*` (WebRTC + useAudioRecording)                               | A/V P2P             | —                                                        | DISCARD   | —    | Decisione Q2 ([ADR 0004](../adr/0004-audio-source-extensibility.md)): MVP solo mic GM, voce player via Discord. Niente WebRTC.                                                  |
| `src/components/VideoStrip.tsx`, `GlobalSearch.tsx`, `Breadcrumbs.tsx` | UI generica         | —                                                        | REFERENCE | —    | Pattern UI, niente codice da copiare (architettura diversa).                                                                                                                    |
| `src/pages/*Page.tsx` (Campaign/Entity/Session/Login...)               | CRUD entità         | —                                                        | REFERENCE | —    | Mostra UX possibili per entità in Amber Coffer; non un port diretto perché architettura SPA-cloud ≠ desktop Tauri.                                                              |
| `src/auth/*`                                                           | Cognito Hosted UI   | —                                                        | DISCARD   | —    | Auth cloud non rilevante: master-app è locale (single-user GM); player-activity passa per Discord Activity.                                                                     |
| `src/api/*`                                                            | REST client         | —                                                        | DISCARD   | —    | Sostituito da `invoke` Tauri lato GM e da MQTT lato player.                                                                                                                     |

### 2.2 Backend (`apps/backend/`)

| Sorgente                                    | Target Amber Coffer | Decisione | Fase                                                                                                                                                                            | Note                                                                                |
| ------------------------------------------- | ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/ws.mjs` (924 righe)                    | —                   | DISCARD   | —                                                                                                                                                                               | Server WebSocket monolitico Node. Sostituito da broker MQTT managed (AWS IoT Core). |
| `src/ws_session_jobs.mjs`                   | —                   | DISCARD   | —                                                                                                                                                                               | Stesso motivo.                                                                      |
| `src/handlers/*.mjs` (14 file)              | REFERENCE           | 2         | Riferimento per le **operazioni di dominio** (campaigns, entities, sessions, transcript, focus, links, patches, ecc.). I nomi e i confini sono guida utile per i comandi Tauri. |
| `src/auth.mjs`, `src/db/*`                  | —                   | DISCARD   | —                                                                                                                                                                               | Auth e accesso DB cloud non riusabili (Rust+sqlx locale).                           |
| `bootstrap.mjs`, `server.mjs`, `Dockerfile` | —                   | DISCARD   | —                                                                                                                                                                               | Lift container Node. Irrilevante.                                                   |

### 2.3 Sidecars (`apps/stt-sidecar`, `apps/cleaner-sidecar`)

| Sorgente           | Target Amber Coffer              | Decisione | Fase     | Note                                                                                                                                     |
| ------------------ | -------------------------------- | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `stt-sidecar/`     | `tools/sidecars/whisper/`        | REFERENCE | 3+       | Sidecar STT esistente. Concetto valido; implementazione cambia (consumo locale via Tauri sidecar, non endpoint HTTP cloud).              |
| `cleaner-sidecar/` | UI master-app + Bedrock (futuro) | REFERENCE | post-MVP | Cleaning trascrizione automatica. Concetto utile, ma in Amber Coffer la cleaning è interattiva (skill `/trascrizione-vc` traduce in UI). |

### 2.4 Contratti (`packages/contracts/`)

| Sorgente                                   | Target Amber Coffer                               | Decisione | Fase | Note                                                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------- | --------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `realtime/envelope.schema.json`            | `packages/shared/src/sync/envelope.ts`            | REFERENCE | 2    | Envelope minimale (`v`, `type`, `sessionId`, `id`, `ts`, `payload`). Lo schema attuale di Amber Coffer è già più strutturato (UUID v7, branded IDs, monotonic seq). |
| `realtime/message.schema.json` (534 righe) | `packages/shared/src/sync/` (discriminated union) | REFERENCE | 2    | Catalogo messaggi real-time. Da scansionare per identificare casi d'uso non ancora coperti dal nuovo `MqttMessage`.                                                 |
| `openapi/*`                                | comandi Tauri                                     | REFERENCE | 2    | Operazioni REST = ispirazione per comandi `invoke`.                                                                                                                 |

### 2.5 Project docs (`project/`)

| Sorgente                                             | Target Amber Coffer                     | Decisione | Fase | Note                                                                                                                                                       |
| ---------------------------------------------------- | --------------------------------------- | --------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project/world-state/*.md`                           | `docs/blueprint.md` § World State       | REFERENCE | 2    | Modello dati world state pregresso. Confrontare con tipi `packages/shared/src/world-state/`.                                                               |
| `project/decisions/adr-0001-mvp-infra-auth.md`       | `docs/adr/0004-...` (lessons)           | REFERENCE | 2    | Decisioni cloud MVP (EC2 + STUN-first + Cognito). **Non riproporre** ma documentare perché Amber Coffer ha scelto diversamente (architettura local-first). |
| `project/decisions/adr-0002-turn-audio-recording.md` | nota in `docs/adr/`                     | REFERENCE | 2    | TURN + audio per partecipante. Soluzione del legacy; in Amber Coffer la voce passa per Discord.                                                            |
| `project/dev-log.md`                                 | —                                       | REFERENCE | —    | Diario storico. Niente da committare.                                                                                                                      |
| `project/poc-cursor-rules/`                          | confronto con `.cursor/rules/` correnti | REFERENCE | 3    | Eventuali rules legacy che il POC ha già anticipato.                                                                                                       |

### 2.6 Infrastruttura (`infra/cdk`, `infra/codebuild`, `infra/docker`, `infra/packer`)

| Sorgente                                | Target Amber Coffer          | Decisione | Fase | Note                                                                                                                                                               |
| --------------------------------------- | ---------------------------- | --------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `infra/cdk/**`                          | `infrastructure/lib/stacks/` | REFERENCE | 2    | Stack EC2 + RDS + Cognito + S3. Il nuovo CDK (Amber Coffer) è IoT Core + DynamoDB + S3/CloudFront + Bedrock. Confronto utile per evitare regressioni di sicurezza. |
| `infra/codebuild/**`, `infra/packer/**` | —                            | DISCARD   | —    | Pipeline build EC2 non applicabili.                                                                                                                                |
| `infra/docker/**`                       | —                            | DISCARD   | —    | Container backend non applicabili.                                                                                                                                 |

### 2.7 Esclusioni dure

| Sorgente                                                            | Motivo                               |
| ------------------------------------------------------------------- | ------------------------------------ |
| `apps/backend/.data/`                                               | Dati locali utente, non sorgente.    |
| `cdk.out/`, `dist/`, `node_modules/`, `.pnpm-store/`, `.pnpm-home/` | Artefatti build / cache.             |
| `.env`, `.aws/`                                                     | Segreti, mai entrare nel repo nuovo. |

## 3. Sintesi numerica

- **Da importare (contenuto markdown)**: ~50 file Markdown del POC, totale stimato < 1 MB testo, da convertire in righe SQLite via tool Fase 5.
- **Da adattare (codice)**: ~1.700 righe TypeScript del legacy `gameMode/*` + `TabletopBoard.tsx`. Stima port effettivo: 30–50% riusabile, il resto riscritto per architettura.
- **Da scartare**: ~2.300 righe WS server + client, sidecar HTTP, auth Cognito, REST API.
- **Da riferire (documentazione)**: ADR, project specs, world-state docs del legacy.

## 4. Punti di pausa — stato decisionale

Risposte utente (Fase 1, 2026-05-17) e ADR generati:

| Domanda                   | Decisione                                                                  | ADR                                                 |
| ------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- |
| System-agnostic vs D&D 5e | **System-agnostic**: `Npc.gameStats` libero key/value, niente MCP D&D      | [0005](../adr/0005-system-agnostic-domain-model.md) |
| Audio scope               | **MVP solo mic GM via Discord**, schema multi-source per estensione futura | [0004](../adr/0004-audio-source-extensibility.md)   |
| Lore + spunti             | **Entità di prima classe** (`LoreNote`, `NarrativeSeed`)                   | [0005](../adr/0005-system-agnostic-domain-model.md) |
| Storage immagini          | **Locale primario + S3 selettivo** (thumbnail token, canon pubblico)       | [0006](../adr/0006-image-storage-strategy.md)       |

Decisioni successive (Fase 4):

| Decisione                                  | Esito                                                                                                                           | Riferimento                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Token: coordinate cella vs pixel           | **Cell-based** (`xCell`/`yCell`)                                                                                                | [tabletop-porting-notes.md](./tabletop-porting-notes.md) §D1 |
| Bench off-board                            | **Sì**, slot verticali                                                                                                          | [tabletop-porting-notes.md](./tabletop-porting-notes.md) §D2 |
| Movimento token da player                  | `token.move.request` via HTTP sync; master valida `controlledByPlayerDiscordId` + `senderDiscordId` (JWT) prima di `move_token` | Implementato (ADR 0014)                                      |
| Handout                                    | **Entità first-class** (tabella `handouts`, schema Zod, messaggi `handout.shown`/`hidden`)                                      | §D4                                                          |
| Presenza player nel tabletop               | **Solo Discord** (niente lobby dedicata)                                                                                        | §D5                                                          |
| Bootstrap nuovo player a sessione in corso | **Snapshot retained MQTT** (`tabletop.snapshot`)                                                                                | §D6                                                          |
| Codice tabletop dove vive                  | **Nuovo package `@amber/tabletop-engine`** + feature in entrambe le app                                                         | §D7                                                          |
| Cleanup symlink legacy-cloud               | **Rimosso in Fase 6** (port completato, residuo documentato)                                                                    | [\_readonly/README.md](../../_readonly/README.md)            |

Punti ancora aperti (da decidere alla loro fase):

- **Gestione segreti utente** (es. `HF_TOKEN` per Hugging Face) — Fase 5, scelta Tauri Stronghold vs file `.env` user-only.
- **Trascrizioni esistenti del POC come fixture** — Fase 5, decisione import tool.
- **System monitor / virtual sink** come seconda sorgente audio — Fase post-MVP, quando si attiverà la seconda sorgente.
- **Implementazione extractor `tools/migrate-from-poc/`** — Fase 5, richiede ancora il symlink `campagna-poc` come fonte di fixture.

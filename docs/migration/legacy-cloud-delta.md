---
title: Delta rispetto al legacy cloud
status: bozza
canonical: true
---

# Legacy cloud → Amber Coffer: cosa portare e cosa scartare

Analisi della distanza architetturale tra il monorepo cloud abbandonato `_readonly/legacy-cloud/` e Amber Coffer.

## Mappa architetturale a confronto

| Layer | Legacy cloud (`_amber-coffer`) | Amber Coffer |
|-------|-------------------------------|--------------|
| Frontend GM | Webapp SPA (React + Vite) servita da S3/CloudFront, dietro Cognito | **App desktop Tauri 2 (Rust + React)**, locale, single-user |
| Frontend Player | Stesse rotte della webapp GM, view "Game Mode" | **Discord Activity** dedicata (`apps/player-activity`), stateless |
| Trasporto real-time | **WebSocket** server Node monolitico (`apps/backend/src/ws.mjs`, 924 righe) + WebRTC P2P + TURN/STUN | **MQTT** managed via AWS IoT Core ([ADR 0003](../adr/0003-mqtt-contract.md)); voce su Discord |
| DB | SQLite **su EC2** dietro server Node (REST + WS) | **SQLite locale Rust+sqlx** dentro il master-app ([ADR 0002](../adr/0002-rust-sqlx-data-layer.md)) |
| Auth | Cognito Hosted UI (OAuth2 PKCE) | **Nessuna auth** GM-side (locale); auth Player via Discord SDK |
| STT pipeline | `apps/stt-sidecar` HTTP, audio caricato in S3, job async | **Sidecar locale** `tools/sidecars/whisper/`, audio sempre locale ([ADR 0004](../adr/0004-audio-source-extensibility.md)) |
| Cleaning trascrizione | `apps/cleaner-sidecar` LLM cloud | UI interattiva di review nel master-app (futuro Bedrock opzionale) |
| Storage immagini | S3 totale dietro auth | **Hybrid local-first** ([ADR 0006](../adr/0006-image-storage-strategy.md)) |
| Infrastruttura | EC2 + RDS + Cognito + S3 + CloudFront + (TURN coturn) | **IoT Core + DynamoDB handshake + S3/CloudFront + Bedrock stub** |

## Cosa si porta

### Logica tabletop (Fase 4a + 4b)

Il legacy ha ~1.700 righe di codice ben pensato in `apps/web/src/pages/gameMode/` e `apps/web/src/components/TabletopBoard.tsx`. La logica di gioco (token, fog of war, mappe, layers, ordine iniziativa) è valida indipendentemente dal trasporto.

**Da analizzare in Fase 4a**:

| File legacy | Cosa contiene | Riusabilità |
|-------------|---------------|-------------|
| `TabletopBoard.tsx` (351 righe) | Rendering canvas, drag&drop token, fog | Alta — sostituire le chiamate WS con bus di stato (Zustand/Redux) e MQTT sub |
| `gameModeTypes.ts` (95 righe) | Tipi di dominio runtime (token, layer, payload) | Alta — confrontare con `packages/shared/src/world-state/{map,token,fog-of-war}.ts` |
| `gameRoomReducer.ts` (72 righe) | Reducer dello stato tavolo | Alta — diventa lo stato condiviso del tabletop |
| `parseTabletopPayload.ts` (116 righe) | Validatori payload realtime | Media — sostituire con Zod schemas già esistenti su `MqttMessage` |
| `useGameModeWebSocket.ts` (236 righe) | Hook WS | Scartare contenuto, mantenere la **forma**: hook MQTT con stesso shape (`{ status, send, lastMessage, subscribe }`) |
| `useGameModeSession.ts` (146 righe) | Lifecycle sessione | Alta — adattare a Tauri commands lato GM |
| `useGameModeMedia.ts` (107 righe) | Media stream WebRTC | Scartare (out of scope) |
| `gameModeRoom.test.ts` (142 righe) | Test reducer | Alta — riusare come baseline test, adattare envelope |

### Contratti realtime (Fase 2, già fatto in shared)

`packages/contracts/realtime/message.schema.json` (534 righe) è un **catalogo** di messaggi runtime del legacy. Andrà confrontato con `packages/shared/src/sync/messages.ts` per identificare casi non ancora coperti (es. job di trascrizione, handshake auth Discord). **Non si copia il file**, si fa diff manuale.

### Documentazione ADR storica (Fase 2, già citata)

- `project/decisions/adr-0001-mvp-infra-auth.md`: documenta perché il legacy ha scelto EC2 + Cognito + STUN-first. Riferimento utile per spiegare in [ADR 0001](../adr/0001-monorepo-tooling.md) di Amber Coffer perché ci spostiamo a IoT Core e local-first.
- `project/decisions/adr-0002-turn-audio-recording.md`: TURN coturn + audio per partecipante. Confluisce come "alternative considerate" nei nostri ADR audio.

### Pattern di nomi e operazioni (Fase 2, già nell'inventory)

I 14 handler in `apps/backend/src/handlers/` (campaigns, entities, sessions, transcript, focus, links, patches, ecc.) sono un **vocabolario di operazioni di dominio**. Buon riferimento per nominare i comandi Tauri in `apps/master-app/src-tauri/src/commands/`.

## Cosa si scarta

### WebSocket server e client (~1.500 righe)

- `apps/backend/src/ws.mjs`, `ws_session_jobs.mjs`
- `apps/web/src/ws/client.ts`, `sessionJobsClient.ts`

Il trasporto è MQTT managed, lo schema envelope è già in `packages/shared/src/sync/envelope.ts`. La logica di reconnect, heartbeat, multiplex room è coperta dal client MQTT (Paho, mqtt.js, aws-iot-device-sdk).

### Backend Node monolitico

- `apps/backend/{bootstrap,server}.mjs`, `Dockerfile`, `auth.mjs`, `db/`, tutti gli handler

Logica spostata in: comandi Tauri lato GM (single-user, niente HTTP API), MQTT pub/sub per real-time, sidecar locali per STT.

### Auth Cognito

- `apps/web/src/auth/*`, `apps/backend/src/auth.mjs`, stack Cognito in `infra/cdk`

GM è single-user locale: nessuna auth. Player passa per Discord SDK (token Discord → handshake DynamoDB → topic MQTT, già in [`infrastructure/lib/stacks/session-handshake.ts`](../../infrastructure/lib/stacks/session-handshake.ts)).

### WebRTC + TURN (out of scope MVP)

- `apps/web/src/rtc/*`, `useGameModeMedia.ts`, ADR-0002 legacy

La voce è Discord. Niente media P2P nel MVP ([ADR 0004](../adr/0004-audio-source-extensibility.md)).

### REST API

- `apps/web/src/api/*`, `packages/contracts/openapi/*`

Sostituito da `invoke` Tauri (interno) e MQTT (real-time).

### Sidecar HTTP

- `apps/stt-sidecar/`, `apps/cleaner-sidecar/`

Sostituiti da sidecar locali Tauri (sub-processo gestito, IPC via stdio o socket Unix).

### Infrastruttura EC2/RDS

- `infra/codebuild/`, `infra/packer/`, `infra/docker/`, stack EC2 in `infra/cdk/`

Nuovo stack CDK: IoT Core + DynamoDB + S3/CloudFront + Bedrock (`infrastructure/lib/stacks/`). Nessuna VM gestita.

## Note operative

- Niente file legacy entra fisicamente nel repo `amber-coffer` se non come **riferimento documentale** (path `_readonly/...` citato negli ADR e nel codice solo in commenti se davvero necessario, mai come import).
- I test del legacy (`gameModeRoom.test.ts`, `backgroundSend.test.ts`, `localVideoLifecycle.test.ts`) verranno **riscritti** nei nuovi pacchetti, non copiati: cambia il transport, cambiano le asserzioni.
- Gli ADR del legacy restano leggibili solo via symlink `_readonly/` durante la migrazione. Se ne perde l'accesso al cleanup (Fase 6), ma le decisioni rilevanti saranno già state cristallizzate negli ADR di Amber Coffer.

## Sintesi numerica

| Categoria | Righe di codice legacy | Decisione |
|-----------|------------------------|-----------|
| Tabletop UI + logica | ~1.700 | ADAPT (Fase 4b) |
| WebSocket server + client | ~1.500 | DISCARD |
| REST handler backend | ~1.500 | REFERENCE (vocabolario operazioni) |
| WebRTC + RTC hooks | ~400 | DISCARD |
| Auth Cognito | ~300 | DISCARD |
| Sidecar STT + cleaner | (TS wrapper) | REFERENCE (logica concettuale) |
| Infrastruttura CDK | ~? | REFERENCE (sicurezza, niente import diretto) |

Bilancio: il legacy è **prevalentemente da scartare** ma fornisce due asset preziosi — la logica tabletop e il catalogo operazioni di dominio.

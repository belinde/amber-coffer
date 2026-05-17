---
title: Note di port del tabletop dal legacy cloud
status: bozza Fase 4a — pre-GO
canonical: true
---

# Tabletop porting notes — `legacy-cloud` → Amber Coffer

Analisi pre-port del tabletop di `_readonly/legacy-cloud/apps/web/`. Scopo: capire **cosa è realmente riusabile** e quali decisioni servono prima di scrivere codice in Fase 4b.

> Fase 4b richiede **GO esplicito dell'utente** prima di toccare `apps/master-app` o `apps/player-activity`.

## File analizzati

| File legacy | Righe | Ruolo |
|-------------|-------|-------|
| `apps/web/src/components/TabletopBoard.tsx` | 351 | Rendering board + bench + drag&drop pointer |
| `apps/web/src/pages/gameMode/gameModeTypes.ts` | 95 | Tipi runtime + selettori puri + reducer types |
| `apps/web/src/pages/gameMode/gameRoomReducer.ts` | 72 | Reducer stato room (WS + tabletop + recording) |
| `apps/web/src/pages/gameMode/parseTabletopPayload.ts` | 116 | Parser difensivi dei payload realtime |
| `apps/web/src/pages/gameMode/useGameModeWebSocket.ts` | 236 | Lifecycle WS + reconnect + dispatch eventi |
| `apps/web/src/pages/gameMode/useGameModeSession.ts` | 146 | Lifecycle sessione, gate, cleanup |
| `apps/web/src/pages/gameMode/useGameModeMedia.ts` | 107 | WebRTC media stream (mic/cam) |
| `apps/web/src/pages/gameMode/gameModeRoom.test.ts` | 142 | Test puri reducer + selettori |
| `packages/contracts/realtime/message.schema.json` | 534 | Catalogo messaggi realtime |

Totale lordo: ~1.800 righe.

## Differenze chiave di modello dati

### Coordinate token

| Aspetto | Legacy | Amber Coffer (attuale `packages/shared/src/world-state/token.ts`) |
|---------|--------|-----------------------------------------------------|
| Coordinate | Cella di griglia (`x: 0..cols-1`, `y: 0..rows-1`) | Pixel (`xPx`, `yPx`) |
| Zona "off-board" | `y = -1` → "bench" (panchina) con `BENCH_SLOTS = 12` | Non modellata |
| Kind token | `'character' \| 'generic'` | `tokenEntityKind` enum più ampio (character/npc/item/marker) |
| Owner | `ownerSub` (Cognito sub) | `entityId` (riferimento all'entità di dominio) — il "chi può muoverlo" è una regola business |
| Identità character | `characterId` (legacy character) | `entityKind + entityId` (qualunque entità) |

**Conseguenza**: il `TabletopBoard.tsx` non si copia direttamente. La sua geometria (`pxToCell`, `cellToStyle`, `nearestFreeCell`) è valida ma va parametrizzata sulla nuova rappresentazione. Decisione necessaria: **manteniamo pixel coords o passiamo a cell coords?** Vedi sezione "Decisioni aperte".

### Grid

| Aspetto | Legacy | Amber Coffer (`Map`) |
|---------|--------|---------------------|
| Tipo | `TabletopGrid = { cols, rows }` ad-hoc | `Map.gridCols`, `Map.gridRows` (sub-set di Map) |
| Default | `cols=24, rows=18` | Niente default; Map è un'entità persistita |
| Background | `backgroundUrl: string \| null` lato stato room | `Map.backgroundImageRef: ImageRef?` |
| Aspect ratio | `'4/3' \| '3/4' \| null` | Da aggiungere a `Map` o calcolato dall'immagine |

**Conseguenza**: il "tabletop state" del legacy è un **derivato della Map attiva** in Amber Coffer. Non serve un blob separato `TabletopState`.

### Stato di room

Il legacy aggrega in un unico `GameRoomState`:

- `wsStatus`, `joinedSessionIdSync` — connessione
- `wsPeerInfos`, `wsMyPeerId` — RTC presence
- `ttGrid`, `ttTokens`, `backgroundUrl`, `tabletopAspect` — tabletop
- `handout` — documento condiviso
- `sessionRecordingBroadcast`, `recordOn` — registrazione

In Amber Coffer questi vivono in **layer separati**:

| Concetto legacy | Amber Coffer (suggerimento) |
|-----------------|-----------------------------|
| `wsStatus`, `joinedSessionIdSync` | `mqttStatus` hook + `Session.id` corrente in store |
| `wsPeerInfos`, `wsMyPeerId` | Presence MQTT (LWT + retained presence topic) o niente nel MVP |
| `ttGrid`, `ttTokens`, ecc. | Selettori derivati dal Map attivo + Token persistenti |
| `handout` | Nuovo concetto da decidere (vedi "Decisioni aperte") |
| `sessionRecordingBroadcast` | Stato `Recording` MVP — solo lato master-app, non broadcast (player non vedono mic GM) |

## Cosa portare (codice utilizzabile)

### Logica geometrica (`TabletopBoard.tsx` lines 23–110)

Funzioni pure:

- `clampInt(v, min, max)` — utility.
- `pxToCell({ clientX, clientY, rect, grid })` — conversione coordinate pointer → cella.
- `pxToBenchSlot` — variante per bench.
- `cellToStyle`, `benchToStyle` — CSS positioning percentuale.
- `nearestFreeCell({ start, grid, occupied })` — espansione "ring" Manhattan per trovare cella libera. Algoritmo solido.
- `nearestFreeBenchSlot`.
- `cellKey`, `zoneOf`, `initialsForName`.

**Decisione port**: copiare la logica matematica in `apps/player-activity/src/features/tabletop/geometry.ts` (e/o `master-app`) come funzioni pure testabili. Niente React. Riscrittura ~50 righe.

### Logica drag&drop (`TabletopBoard.tsx` lines 122–349)

Pointer capture, ghost rendering, snap-to-free-cell. Riusabile concettualmente, ma:

- Va riscritto per consumare `Token` (nuovo schema, pixel coords).
- L'ownership ("posso muovere questo token?") viene decisa dal layer di policy, non dal componente.
- La "bench" è un add-on opzionale: nel MVP probabilmente skippiamo (token off-board = visibility GM only).

**Decisione port**: porting selettivo. Il componente nuovo riusa la logica geometrica importata, ma il rendering JSX è da riscrivere per integrarsi col CSS di Amber Coffer e con i nostri tipi.

### Reducer + selettori (`gameModeTypes.ts` + `gameRoomReducer.ts`)

Le funzioni pure:

- `canPlayerEnterGate({ activeSessionId, charactersLength, activeCharacterId })`.
- `selectTabletopActive({ room, activeSessionId, isMaster, canPlayerEnter })`.
- `selectShouldRecordLocalAudio(...)` — interessante: gestisce la separazione master/player per il recording.

**Decisione port**: i selettori puri sono un buon **pattern** ma le firme cambiano. In Amber Coffer:

- `canPlayerEnterGate` → `canPlayerEnterSession(session, character)` (più type-safe).
- `selectTabletopActive` → derivato da `mqttStatus === 'connected' && currentMapId !== null`.
- `selectShouldRecordLocalAudio` → solo lato master-app: `recordingOn && currentSessionId !== null`. Player non hanno recording locale ([ADR 0004](../adr/0004-audio-source-extensibility.md)).

### Parser realtime (`parseTabletopPayload.ts`)

Validazione difensiva ad-hoc. In Amber Coffer **scartare il pattern**: usiamo Zod su `MqttMessage`. Il parser legacy è interessante solo come riferimento dei campi da coprire.

### Test pattern (`gameModeRoom.test.ts`)

Test di funzioni pure con Vitest. **Pattern eccellente**, da riusare 1:1 nello stile. I test specifici vanno riscritti con i nuovi tipi.

### Catalogo messaggi (`message.schema.json`)

Coperto in Amber Coffer (`packages/shared/src/sync/messages.schema.ts`):

| Messaggio legacy | Coperto in MqttMessage attuale | Gap |
|-------------------|-------------------------------|-----|
| `AUTH` | — | Non serve: l'auth è handshake DynamoDB pre-MQTT |
| `ERROR` | — | Non serve come messaggio: errori sono response interne, non broadcast |
| `TABLETOP.JOIN` | — | Sostituito da subscribe topic `amber-coffer/{campaignId}/{sessionId}/+` |
| `TABLETOP.PRESENCE` | — | **Gap**: presence non modellata. Forse via retained MQTT su topic dedicato |
| `TABLETOP.SESSION_END` | `session.handshake` con stato di chiusura? | **Gap**: aggiungere `session.ended` |
| `TABLETOP.STATE` | (snapshot completo) | **Gap**: snapshot non modellato. MVP ok partire da entity sync, non snapshot |
| `TABLETOP.SESSION_RECORDING.SET` | — | Out of scope MVP (recording solo locale) |
| `TABLETOP.BACKGROUND.SET` | `map.updated` (cambia `backgroundImageRef`) | OK |
| `TABLETOP.TOKEN.MOVE` (richiesta) | — | Richieste vanno via Tauri invoke lato GM; player non muovono token nel MVP. **Decisione aperta** |
| `TABLETOP.TOKEN.MOVED` (broadcast) | `token.moved` | OK |
| `TABLETOP.GTOKEN.CREATE/DELETE` | `token.created` / `token.removed` | OK (lato GM) |
| `RTC.*` | — | Scartato (no WebRTC) |

**Gap identificati**: presence, session.ended, snapshot iniziale. Da affrontare in Fase 4b o in un ADR separato.

## Cosa scartare

- `useGameModeMedia.ts` — WebRTC media: out of scope MVP ([ADR 0004](../adr/0004-audio-source-extensibility.md)).
- `useGameModeWebSocket.ts` (per intero, niente copia) — il transport è MQTT, riscriviamo. Però **rubiamo il pattern**: reconnect con backoff exponential capped a 10s, dispatch eventi tipizzati, ref isolate per evitare stale closures.
- `apps/web/src/ws/client.ts` (244 righe) — sostituito da `aws-iot-device-sdk-v2` o `mqtt.js`.
- Gestione `handout` legacy — concetto valido (mostra un documento ai player) ma non ancora coperto; vedi "Decisioni aperte".
- Gestione `sessionRecordingBroadcast` — broadcast del fatto che il GM sta registrando: nel MVP non serve; il GM può segnalarlo via Discord se vuole.

## Stack target

### Player Activity (`apps/player-activity`)

- Nuovo modulo `src/features/tabletop/`:
  - `geometry.ts` — funzioni pure portate da `TabletopBoard.tsx`.
  - `TabletopView.tsx` — componente presentational che riceve `Map` e `Token[]`, renderizza grid + token + fog of war.
  - `useTabletopSubscription.ts` — hook MQTT sub: ascolta `token.*`, `map.*`, `fog.*`, applica al local store.
  - `store.ts` — Zustand (libreria già da valutare: vedi ["Dipendenze nuove"](#dipendenze-nuove)) con stato tabletop derivato dai messaggi.
  - `tabletop.test.ts` — test puri su geometry e reducer.

### Master App (`apps/master-app`)

- Modulo `src/features/tabletop-control/`:
  - Riusa `geometry.ts` esportato da `packages/shared` (sì? vedi decisioni).
  - `TabletopControlView.tsx` — vista editor del GM: posiziona token, crea generic, gestisce fog.
  - Bridge Tauri: `invoke('place_token')`, `invoke('move_token')`, `invoke('toggle_fog_region')`.
  - Logica autoritativa: ogni modifica è applicata localmente + pubblicata su MQTT con `seq` incrementato.

### Packages/shared

- Geometry: spostare in `packages/shared/src/world-state/tabletop-geometry.ts`? Pro: riusato da entrambe le app. Contro: aumenta scope di `shared`. **Decisione aperta**.
- Aggiungere `MqttMessage` per `session.ended`, `presence`, `tabletop.snapshot` se confermato. ADR dedicato.

## Decisioni aperte (bloccano Fase 4b)

### D1. Coordinate token: pixel o cella?

- **Legacy**: cella (intero, snap automatico).
- **Attuale Amber Coffer**: pixel (`xPx`, `yPx`).
- **Pro cella**: snap-to-grid naturale, niente coordinate fuori bordi, layout responsivo facile (percentuali).
- **Pro pixel**: token con dimensioni diverse, mappe senza griglia rigida (es. terreni naturali).
- **Domanda**: il MVP supporta griglie non rigide? Se no, **convertire `Token` a cell coords**.

### D2. Bench (off-board zone)

- **Legacy**: zona panchina con 12 slot per token non in scena.
- **Domanda**: è una feature MVP o si può rimandare? L'alternativa è `visible_to_players: false` sul token (già presente nel `Token` attuale).

### D3. Player può muovere il proprio token?

- **Legacy**: sì, se `ownerSub === mySub`. Il player invia `TABLETOP.TOKEN.MOVE`, il server fa `TOKEN.MOVED`.
- **MVP Amber Coffer**: lo permettiamo o solo GM muove? Se sì, va aggiunto `MqttMessage.kind === 'token.move.request'` con autorizzazione lato GM.
- **Domanda utente**.

### D4. Handout (documento condiviso)

- **Legacy**: `handout = { assetId, publicUrl, label }` mostrato a tutti i player.
- **Amber Coffer**: concetto utile (mostra una mappa, un disegno, un PNG portrait). Non ancora modellato.
- **Domanda**: aggiungere `Handout` come entità o estendere `Map` con `overlayLayer`?

### D5. Presence dei player

- **Legacy**: `TABLETOP.PRESENCE` con `peers[]` per peer RTC.
- **MVP Amber Coffer**: la presence è già fornita da Discord (chi è nella voice channel). Quindi: serve replicarla lato tabletop?
- **Domanda**: presence MVP = lista Discord users che hanno aperto l'Activity, o niente?

### D6. Snapshot iniziale

- **Legacy**: `TABLETOP.STATE` invia tutto lo stato in un colpo al join.
- **Amber Coffer**: la Player Activity al boot deve ricevere lo snapshot di Map + Token + FogRegion attivi.
- **Domanda**: snapshot via MQTT retained su topic `.../tabletop/snapshot`, oppure REST one-shot lato GM (Tauri non espone HTTP) o S3 (canon pubblico)?

### D7. Geometry in `packages/shared` o duplicata?

- Pro shared: DRY, una sola implementazione.
- Contro shared: aumenta surface, richiede import in tutte le app.
- **Suggerimento**: in `packages/shared/src/world-state/tabletop-geometry.ts` come modulo opzionale; entrambe le app la importano.

## Sintesi pre-GO Fase 4b

| Categoria | Quantità | Decisione |
|-----------|----------|-----------|
| Geometry pure functions | ~80 righe | PORT (in `packages/shared/src/world-state/tabletop-geometry.ts`) |
| TabletopBoard JSX | ~230 righe | RISCRITTURA (player-activity); pattern riusato |
| Reducer + selettori | ~170 righe | RISCRITTURA con nuovi tipi (pattern riusato) |
| Hook WS | ~236 righe | RISCRITTURA totale (transport MQTT) |
| Hook Session | ~146 righe | ADAPT lato master-app (Tauri invoke) |
| Hook Media (WebRTC) | ~107 righe | SCARTO |
| Parser payload | ~116 righe | SCARTO (Zod copre tutto) |
| Test pattern | ~140 righe | RISCRITTURA (pattern eccellente) |

Codice **realmente portabile (cv compreso adattamenti)**: ~80 righe geometry + ~150 righe di pattern (reducer/selettori/test). Il resto è ispirazione.

## Domande bloccanti per l'utente

Prima di scrivere codice in Fase 4b, decisioni necessarie su:

1. **D1**: coordinate cella vs pixel.
2. **D2**: bench off-board nel MVP?
3. **D3**: player muove il proprio token nel MVP?
4. **D4**: handout come entità separata?
5. **D5**: presence player nel tabletop o solo via Discord?
6. **D6**: come fa la Player Activity a ricevere lo snapshot iniziale?
7. **D7**: geometry in `packages/shared` o duplicata?

Inoltre serve il **GO operativo** all'inizio di Fase 4b (port effettivo del codice).

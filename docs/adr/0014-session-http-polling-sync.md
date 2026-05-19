# ADR 0014: Sync tattico HTTP (polling)

**Stato**: Accettato  
**Data**: 2026-05-19

## Contesto

Master App e Player Activity devono condividere stato tattico effimero (token, mappe, handout). AWS IoT Core con MQTT WebSocket non è utilizzabile dietro il proxy Discord Activity (`/.proxy/iot`): il tunnel WSS si apre ma i frame MQTT binari non transitano.

Il tavolo non richiede aggiornamenti sub-secondo: latenza di **circa 2 secondi** è accettabile.

## Decisione

- **Trasporto**: HTTP su API Gateway (`GET /session/sync/state`, `PUT /session/sync/snapshot`, `POST /session/sync/events`).
- **Polling**: master e player eseguono un loop `setTimeout` ricorsivo ogni **2 s** (`pollIntervalMs` restituito dal handshake).
- **Stato canonico cloud**: tabella DynamoDB `session_sync_state` (snapshot + coda `pendingEvents` player).
- **Autenticazione**: JWT HMAC (`session-auth-secret`) con claim `role: 'player' | 'master'`.
- **Payload**: stessa discriminated union `MqttMessage` / `tabletop.snapshot` di [ADR 0003](./0003-mqtt-contract.md) (nome storico; trasporto non è più MQTT).
- **Master**: SQLite resta autoritativo; ogni tick poll fa PUT snapshot se dirty e GET per consumare `pendingEvents`.
- **Player**: GET snapshot; POST eventi (es. `token.move.request`) al drag.
- **AWS IoT Core**: rimosso dal progetto (stack CDK distrutto, nessun client `aws-iot-device-sdk`).

## Conseguenze

### Positive

- Funziona nell'iframe Discord via solo mapping `/api`.
- Modello semplice da debuggare (CloudWatch + curl).
- 304 su `If-None-Match` / `sinceVersion` riduce payload.

### Negative

- Latenza minima ~2 s (configurabile server-side).
- DynamoDB come bus condiviso (costi trascurabili a basso volume).
- Master deve tenere token API (`POST /session/master/token`).

## Riferimenti

- [ADR 0003](./0003-mqtt-contract.md) (superseded — payload invariato)
- [ADR 0012](./0012-amber-discord-application.md) — URL mappings senza `/iot`
- `packages/shared/src/sync/session-sync.schema.ts`
- `infrastructure/lambdas/session-sync-*/`

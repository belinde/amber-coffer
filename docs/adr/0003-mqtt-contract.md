# ADR 0003: Contratto sincronizzazione MQTT

**Stato**: Accettato  
**Data**: 2026-05-17

## Contesto

Master App e Player Activity devono sincronizzare stato tattico effimero (token, fog, mappe) in real-time. AWS IoT Core fornisce MQTT gestito. La Player Activity è stateless: non persiste logica di gioco.

## Decisione

- **Topic**: `amber-coffer/{campaignId}/{sessionId|_}/{channel}` dove `channel` ∈ `tokens|fog|maps|entities|control`
- **Envelope**: `SyncEnvelope<T>` con `v=1`, `campaignId`, `sessionId`, `senderRole`, `senderId`, `seq` monotonico, `timestamp`, `payload`
- **Payload**: discriminated union `MqttMessage` (kind + dati) validata con Zod in `packages/shared`
- **ID**: UUID v7 generati dal Master; LWW tramite campo `version` sulle entità persistenti
- **Sequenza**: tabella `sync_sequence` + `sync_outbox` in SQLite per affidabilità publish

## Conseguenze

### Positive

- Contratto tipizzato end-to-end (TS) prima dell'implementazione client MQTT
- Messaggi out-of-order scartabili via `seq`
- Estensibile (nuovi `kind` senza breaking se versionati)

### Negative

- Master resta autoritativo: conflitti player risolti lato GM
- Implementazione broker IoT ancora da completare in `infrastructure/`

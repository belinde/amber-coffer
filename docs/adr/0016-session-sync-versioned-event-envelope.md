# ADR 0016: Versioned event envelope per session-sync

**Stato**: Accettato  
**Data**: 2026-06-02

## Contesto

La pipeline session-sync HTTP polling ([ADR 0014](./0014-session-http-polling-sync.md)) trasporta eventi tattici tramite il campo `pendingEvents` nella risposta `GET /session/sync/state`. Prima di questa modifica il wire-format era:

```ts
pendingEvents: z.array(mqttMessageSchema); // array piatto di messaggi
```

Questo formato rende **impossibile** il content-filtering per client: il server non può sapere quali eventi un dato client ha già ricevuto perché i messaggi non portano alcun identificatore di versione. Il risultato è un bug di non-convergenza sotto attività concorrente multi-player (spec `tabletop-token-sync-loop`): ogni poll re-distribuisce l'intero backlog, ogni client ri-applica eventi già processati, e i token si muovono autonomamente a tempo indeterminato.

## Decisione

Cambiare il wire-format di `pendingEvents` da array piatto di `MqttMessage` a array di **envelope versionati**:

```ts
// packages/shared/src/sync/session-sync.schema.ts
export const sessionSyncEventSchema = z.object({
  eventVersion: z.number().int().positive(),
  message: mqttMessageSchema,
});

pendingEvents: z.array(sessionSyncEventSchema);
```

Ogni evento riceve un `eventVersion` monotonicamente crescente assegnato dal server al momento dell'append. Il client passa `sinceVersion` e il server restituisce solo eventi con `eventVersion > sinceVersion`.

### Consumatori del contratto

Il cambio è una **migrazione coordinata interna** alla pipeline session-sync:

| Componente                             | Ruolo                                                      |
| -------------------------------------- | ---------------------------------------------------------- |
| `infrastructure/lambdas/session-sync/` | Produce gli envelope (append) e filtra per versione (read) |
| `apps/player-activity`                 | Consuma `pendingEvents` versionati nel poll client         |
| `apps/master-app`                      | Consuma `pendingEvents` versionati nel poll master         |

Non esistono consumatori esterni: il contratto è privato alla pipeline sync.

### Giustificazione

- Il content-filtering per client è **impossibile** senza un identificatore di versione per evento — il server non può distinguere "già visto" da "nuovo" per un dato client.
- La soluzione **estende i contratti Zod esistenti** (`mqttMessageSchema` rimane invariato dentro l'envelope) senza introdurre nuove dipendenze.
- È coerente con le steering rules del progetto: validazione Zod al boundary, tipi inferiti dallo schema, nessuna libreria aggiuntiva.

## Conseguenze

### Positive

- Abilita delivery at-most-once per client (risolve il bug di replay loop).
- Permette drain del backlog server-side basato su versione minima confermata.
- Il campo `eventVersion` funge da identity per deduplicazione e ordinamento.
- Backward-compatible nella logica di processing: `message` contiene lo stesso `MqttMessage` di prima.

### Negative

- Payload leggermente più grande (un campo `eventVersion: number` per evento).
- Deploy coordinato richiesto: Lambda, player-activity e master-app devono essere aggiornati insieme (accettabile dato che il contratto è interno e il deploy è atomico via CDK + Vite).

## Riferimenti

- [ADR 0014](./0014-session-http-polling-sync.md) — architettura sync HTTP polling
- [ADR 0003](./0003-mqtt-contract.md) — contratto `MqttMessage` (payload invariato)
- `packages/shared/src/sync/session-sync.schema.ts` — definizione schema
- Spec bugfix: `.kiro/specs/tabletop-token-sync-loop/`

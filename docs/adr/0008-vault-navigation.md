# ADR 0008: Navigazione World Vault (stack in-app, router futuro)

**Stato**: Accettato  
**Data**: 2026-05-17

## Contesto

Il World Vault sostituisce la nav piatta a sei CRUD con un hub per campagna, browse a card e schede entità a sezioni (allineate a `docs/migration/entity-templates.md`). Serve decidere come gestire lista → dettaglio → ritorno.

## Decisione

### MVP (questo sprint)

- Navigazione con **stack in-app** (`useVaultNavigation`: `home` | `connections` | `category` | `detail`).
- Nessuna dipendenza `react-router` nel master-app Tauri.
- Back: `popView()` + pulsante UI; nessun URL nel browser.

### Futuro (trigger espliciti)

Migrare a `react-router` (probabilmente `MemoryRouter` in Tauri) quando almeno uno:

- build web del master con deep link;
- E2E che assertano path (`/campaign/:campaignId/vault/:type/:id`);
- condivisione bookmark di scheda entità.

Route target documentate:

`/campaign/:campaignId/vault/:category/:entityId`

Tab/sezioni opzionali come hash o segmento (`/appearance`).

## Conseguenze

### Positive

- Coerente con dipendenze minime e desktop-first.
- Refactor incrementale senza cambiare il modello dati.

### Negative

- Indietro del SO non integrato finché non c’è router.
- Stato navigazione non serializzabile in URL.

## Alternative considerate

- **react-router subito**: scartato per MVP Tauri senza barra indirizzi.
- **Mantenere CRUD nav**: scartato; non soddisfa UX organica richiesta.

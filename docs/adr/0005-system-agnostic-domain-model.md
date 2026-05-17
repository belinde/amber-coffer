# ADR 0005: Modello di dominio system-agnostic + entità Lore e Narrative Seeds

**Stato**: Accettato  
**Data**: 2026-05-17

## Contesto

Il POC `_readonly/campagna-poc/` è interamente specifico a **D&D 5e**: le schede PNG includono una sezione `## Scheda di gioco` obbligatoria con livello, CA/PF, caratteristiche, tiri salvezza, e un server MCP `dnd` esterno fornisce dati ufficiali. Il file [`.cursor/rules/png-scheda-gioco.mdc`](mdc:_readonly/campagna-poc/.cursor/rules/png-scheda-gioco.mdc) impone questo schema.

Amber Coffer mira a essere usabile per **qualsiasi sistema di gioco** (D&D 5e, Pathfinder 2e, Cyberpunk RED, homebrew, ecc.). Inoltre il POC contiene due tipologie di contenuto narrativo che oggi non sono nel modello di Amber Coffer:

- **Concetti** (`ambientazione/concetti/*.md`: religione, economia, storia, geografia, tecnomagia, ecc.) — lore strutturale del mondo.
- **Spunti** (`spunti/*.md`) — idee narrative non ancora avvenute, non parte del canon.

L'utente ha confermato (Q1 inventario): modello **system-agnostic** con `gameStats` libero; (Q3 inventario): `LoreNote` e `NarrativeSeed` come **entità di prima classe**.

## Decisione

### Domain model agnostico

In `packages/shared/src/world-state/character.ts` e `npc.ts`:

- **Nessun campo specifico a un sistema di gioco** nei tipi base.
- Campo opzionale `gameStats: GameStatsRecord` dove `GameStatsRecord` è `Record<string, string | number | boolean | null>` (key/value liberi gestiti dall'utente).
- Campo opzionale `gameSystemHint: string` libero (es. `"dnd5e"`, `"pf2e"`, `"custom"`) usato solo per UI hint, non per validazione.
- **Nessun MCP `dnd`**: il prodotto non integra API specifiche del sistema. L'utente può collegarne uno esternamente se vuole.

### Due nuove entità di dominio

In `packages/shared/src/world-state/lore-note.ts` (nuovo):

```typescript
export interface LoreNote {
  id: LoreNoteId;
  campaignId: CampaignId;
  title: string;
  kind: 'concept' | 'history' | 'culture' | 'economy' | 'religion' | 'cosmology' | 'custom';
  body: string;
  tags: string[];
  visibility: 'gm_only' | 'shared' | 'public_canon';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

In `packages/shared/src/narrative/narrative-seed.ts` (nuovo):

```typescript
export interface NarrativeSeed {
  id: NarrativeSeedId;
  campaignId: CampaignId;
  title: string;
  summary: string;
  status: 'idea' | 'planned' | 'introduced' | 'closed' | 'discarded';
  linkedEntityIds: EntityRef[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

Entrambe ricercabili, linkabili a `Location`/`Faction`/`Npc`/`Character` via `EntityRef` discriminato.

### SQL

In `apps/master-app/src-tauri/migrations/` due nuove tabelle (`lore_notes`, `narrative_seeds`) + indici su `campaign_id`, `kind`/`status`, `updated_at`. La migration viene scritta in Fase 5 insieme al tool di import.

## Conseguenze

### Positive

- Prodotto utilizzabile per qualunque sistema di gioco senza compromessi nello schema.
- Lore e spunti diventano ricercabili e linkabili (search globale, riferimenti incrociati nei resoconti).
- Eventuali integrazioni system-specific (es. modulo D&D 5e) possono essere plugin opzionali futuri senza toccare lo schema base.

### Negative

- L'utente che vuole una scheda 5e rigida (CA, PF, ecc.) non ha autocompletamento o validazione: digita campi liberi. Mitigazione futura: preset di template campi (Fase post-MVP), non blocchi di schema.
- Due nuove tabelle e tipi da mantenere, ulteriore superficie per i comandi Tauri (CRUD `lore_notes`, `narrative_seeds`).

## Alternative considerate

- **Schema rigido 5e**: scartato. Lega il prodotto a un sistema specifico.
- **Schema con `gameSystem` discriminato per preset rigidi**: scartato per il MVP. Aggiunge complessità senza benefici concreti finché non c'è almeno una seconda integrazione.
- **Lore e spunti come testo Markdown libero**: scartato. Niente search, niente link, niente filtri per `kind`/`status`.

## Riferimenti

- POC entity templates: `_readonly/campagna-poc/.cursor/rules/campagna.mdc` (struttura cartelle), `png-scheda-gioco.mdc` (schema 5e che **non** importiamo come obbligo).
- Inventario migrazione: [docs/migration/inventory.md](../migration/inventory.md) § 1.1, 1.2.

---
title: Template canonici delle entità (ex regole POC)
status: bozza
canonical: true
---

# Entity templates — canonici per Amber Coffer

Distillato delle convenzioni del POC `_readonly/campagna-poc/` tradotto in **template di campi** e **principi di dominio** per il modello tipizzato. Niente Markdown obbligatorio nel prodotto: questi sono i campi che lo schema deve esprimere e le regole che la UI deve far rispettare.

Per i tipi corrispondenti, vedi `packages/shared/src/world-state/` e `packages/shared/src/narrative/`. Gli ADR di riferimento sono [0005](../adr/0005-system-agnostic-domain-model.md) (system-agnostic + LoreNote + NarrativeSeed) e [0006](../adr/0006-image-storage-strategy.md) (immagini).

## Principi cross-entità

### 1. Tratti fissi vs stato di scena

Distinzione cardine che viene dalla rule `personaggio-aspetto.mdc` del POC. Si applica a `Character`, `Npc` e `Location`.

| Concetto                                                                   | Dove vive nello schema                                                                                  | Esempi                                                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Tratti fissi (permanenti)**                                              | `appearance` (testo narrativo), `visualReference.prompt`, `appearance.permanentMarks[]`                 | Corporatura, età apparente, capelli, equipaggiamento abituale, cicatrici permanenti, temperamento visivo cronico |
| **Stato di scena (transitorio)**                                           | `eventsInteresting[]` (riferito a una `Session`), note GM-only, `Recording`/`Transcript` della sessione | Emozioni acute, ferite in corso, pose da combattimento, travestimenti, sangue/polvere da un evento preciso       |
| **Eccezione**: cicatrice o segno permanente promosso da uno stato di scena | Aggiornare `appearance` + `visualReference` **solo** quando il GM approva la promozione                 | Cicatrice che resta dopo lo scontro, amputazione, nuovo equipaggiamento iconico                                  |

**Regola di UI/UX**: l'editor di `appearance` non deve mostrare il diff "ultima sessione". Dopo un resoconto la feature `session-recap` può **proporre** patch di `appearance` (es. "Maren ora ha una cicatrice sopra l'occhio") ma il GM le approva esplicitamente.

### 2. Lingua del prompt visuale

`visualReference.prompt` è **libero in lingua**. Convenzione tipica del POC: **inglese**, anche se la UI è italiana, perché i modelli image ottengono risultati migliori. Lo schema non vincola la lingua.

Struttura raccomandata (non obbligatoria) del prompt:

```text
Image prompt:

<self-contained description, no proper names, "cinematically realistic" or equivalent>

Constraints to preserve:

<height/proportions, key visible items, mood>

Details to avoid:

<typical model errors: cartoon, plastic CGI, generic fantasy illustration, ...>
```

Questa struttura è guida-utente, non format check.

### 3. Eventi interessanti

Tutte le entità che hanno una storia con la campagna (`Character`, `Npc`, `Location`, `Faction`) hanno un array `eventsInteresting: EventReference[]` dove `EventReference = { sessionId, summary, occurredAt }`. Format display tipico (rendering UI o export):

```text
**[Sessione 003]** Maren rivela di conoscere la famiglia Halverson da prima della Strage.
```

La numerazione `[Sessione NNN]` è cosmetica: deriva da un index sessione per campagna, non da un campo separato.

## 4. Visibility / canon pubblico

Ogni entità importante ha `visibility: 'gm_only' | 'shared' | 'public_canon'`:

- `gm_only` — visibile solo nel master-app (default).
- `shared` — sincronizzata col player-activity durante la sessione (tabletop, info di parte).
- `public_canon` — esportata sul sito pubblico CloudFront. Trigger pipeline di upload S3 L3 ([ADR 0006](../adr/0006-image-storage-strategy.md)).

## Template per entità

### Campaign

Metadati in `campaign.json` per cartella storage (non riga SQLite dedicata).

| Campo                               | Tipo                           | Note                                                                                                                                                |
| ----------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                | `CampaignId`                   | UUID v7                                                                                                                                             |
| `name`                              | `string`                       |                                                                                                                                                     |
| `slug`                              | `string`                       | Univoco per installazione                                                                                                                           |
| `description`                       | `string?`                      | Testo lungo / note import                                                                                                                           |
| `catchphrase`                       | `string?`                      | Tagline breve della campagna                                                                                                                        |
| `playLanguage`                      | `'it' \| 'en' \| 'fr' \| 'es'` | **Lingua di gioco** al tavolo: annunci vocali del bot di registrazione Discord e hint per trascrizione STT. Default `it` se assente in JSON legacy. |
| `discordChannelId`                  | `DiscordChannelId?`            | Canale vocale per `discord_capture`                                                                                                                 |
| `createdAt`, `updatedAt`, `version` |                                |                                                                                                                                                     |

### Character (PG)

Sorgente POC: `personaggi/*.md`. Owner: GM, ma legato a un `playerDiscordId` (Discord ID del giocatore).

| Campo                    | Tipo                                      | Note                                                                        |
| ------------------------ | ----------------------------------------- | --------------------------------------------------------------------------- |
| `id`                     | `CharacterId` (UUID v7)                   |                                                                             |
| `campaignId`             | `CampaignId`                              |                                                                             |
| `playerDiscordId`        | `DiscordUserId?`                          | Null se PG non assegnato                                                    |
| `name`                   | `string`                                  |                                                                             |
| `species`                | `string?`                                 | Es. "Umano", "Halfling", libero                                             |
| `roleHint`               | `string?`                                 | Es. "Pistolero esploratore", libero                                         |
| `appearance`             | `Appearance`                              | `description` + `permanentMarks[]` + `visualReference`                      |
| `gameStats`              | `GameStatsRecord?`                        | Key/value libero ([ADR 0005](../adr/0005-system-agnostic-domain-model.md))  |
| `gameSystemHint`         | `string?`                                 | `"dnd5e"`, `"pf2e"`, ... — hint UI                                          |
| `notableEquipment`       | `string[]`                                | Visibile, distintivo                                                        |
| `eventsInteresting`      | `EventReference[]`                        |                                                                             |
| `image`                  | `ImageRef?`                               | L1 path + L2/L3 URL opt ([ADR 0006](../adr/0006-image-storage-strategy.md)) |
| `gmNotes`                | `string`                                  | GM only                                                                     |
| `visibility`             | `'gm_only' \| 'shared' \| 'public_canon'` |                                                                             |
| `createdAt`, `updatedAt` | `Timestamp`                               |                                                                             |

### Token (tavolo tattico)

Rappresenta un PG o PNG sulla mappa attiva. Il controllo drag in Discord Activity non dipende da `entityKind`: usa `controlledByPlayerDiscordId`.

**Pre-creazione PG:** per ogni `character` con `status = active` esiste al più un token per mappa (`UNIQUE(map_id, entity_kind, entity_id)`). I token PG mancanti vengono creati in panchina da `ensure_character_tokens` (all'apertura del tavolo, alla creazione PG/mappa). Alla creazione, `controlledByPlayerDiscordId` copia `Character.playerDiscordId` se presente; su ensure successivi si aggiorna solo se il controller è ancora `NULL`.

**Etichette letterali:** lo snapshot `tabletop.snapshot` include `tokenLabels` (iniziali) e `tokenNames` (nome completo per accessibilità); nessuna immagine sul token in questa fase.

| Campo                         | Tipo                   | Note                                                                                  |
| ----------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `entityKind`                  | `'character' \| 'npc'` | Riferimento all'entità sotto il token                                                 |
| `entityId`                    | `string`               | Id dell'entità (PG o PNG)                                                             |
| `controlledByPlayerDiscordId` | `DiscordUserId?`       | Giocatore che può trascinare il token (PG assegnato o evocazione/NPC delegato dal GM) |
| `visibleToPlayers`            | `boolean`              | Se false, il token non appare nell'Activity                                           |
| `position`                    | `board \| bench`       | Coordinate a griglia (`xCell`/`yCell`) o slot panchina                                |

### Npc (PNG)

Sorgente POC: `png/*.md`. Riusa quasi tutti i campi di `Character`, aggiunge:

| Campo aggiuntivo    | Tipo                       | Note (dalla rule `campagna.mdc`)                                           |
| ------------------- | -------------------------- | -------------------------------------------------------------------------- |
| `region`            | `string?`                  | Macro-area narrativa (ex `**Regione:**`)                                   |
| `scope`             | `string?`                  | Ancoraggio operativo: luogo, fazione, viaggio, famiglia (ex `**Ambito:**`) |
| `reminder`          | `string?`                  | Una frase su chi è e perché conta (ex `**Promemoria:**`)                   |
| `linksToCharacters` | `LinkToCharacter[]`        | Relazioni narrative coi PG                                                 |
| `kind`              | `'canonical' \| 'scratch'` | `scratch` = creato durante una sessione live, non ancora canonizzato       |

Campi `region`, `scope`, `reminder` **non sono obbligatori** ma sono **suggeriti** dalla UI (placeholder). Il POC li aveva obbligatori per disciplina; nel prodotto restano opzionali per non bloccare il flusso.

### Location (Luogo)

Sorgente POC: `ambientazione/luoghi/*.md`. Schema:

| Campo                    | Tipo                                      | Note                                                                                |
| ------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `id`                     | `LocationId`                              |                                                                                     |
| `campaignId`             | `CampaignId`                              |                                                                                     |
| `parentLocationId`       | `LocationId?`                             | Gerarchia (regione → città → quartiere)                                             |
| `name`                   | `string`                                  |                                                                                     |
| `region`                 | `string?`                                 | Es. "Middle West", "East Coast"                                                     |
| `kind`                   | `string?`                                 | "Città libera", "Fattoria", "Forte", libero                                         |
| `population`             | `string?`                                 | Stima testuale ("~40.000")                                                          |
| `appearance`             | `Appearance`                              | Lungo (per i luoghi nessun limite 2–4 frasi)                                        |
| `sections`               | `LocationSection[]`                       | Sezioni libere: economia, fazioni e potere, ganci narrativi, storia, abitanti, ecc. |
| `image`                  | `ImageRef?`                               |                                                                                     |
| `eventsInteresting`      | `EventReference[]`                        |                                                                                     |
| `visibility`             | `'gm_only' \| 'shared' \| 'public_canon'` |                                                                                     |
| `createdAt`, `updatedAt` | `Timestamp`                               |                                                                                     |

`sections[]` permette al GM di strutturare la descrizione libera senza fissare lo schema (a differenza del POC che aveva sezioni Markdown standardizzate).

### Faction (Nazione / Organizzazione)

Sorgente POC: `ambientazione/nazioni/*.md`. Campi simili a `Location` con:

| Campo dedicato           | Tipo                                                                            | Note                     |
| ------------------------ | ------------------------------------------------------------------------------- | ------------------------ |
| `kind`                   | `'state' \| 'kingdom' \| 'company' \| 'guild' \| 'cult' \| 'family' \| 'other'` | Discriminante grossolana |
| `parentFactionId`        | `FactionId?`                                                                    | Sotto-fazioni            |
| `headquartersLocationId` | `LocationId?`                                                                   | Sede principale          |
| `goals`                  | `string`                                                                        | Obiettivi noti           |
| `secrets`                | `string`                                                                        | GM only                  |

### LoreNote (Concetto di ambientazione)

Sorgente POC: `ambientazione/concetti/*.md`. Nuova entità ([ADR 0005](../adr/0005-system-agnostic-domain-model.md)).

| Campo            | Tipo                                                                                        | Note                          |
| ---------------- | ------------------------------------------------------------------------------------------- | ----------------------------- |
| `id`             | `LoreNoteId`                                                                                |                               |
| `campaignId`     | `CampaignId`                                                                                |                               |
| `title`          | `string`                                                                                    |                               |
| `kind`           | `'concept' \| 'history' \| 'culture' \| 'economy' \| 'religion' \| 'cosmology' \| 'custom'` |                               |
| `body`           | `string`                                                                                    | Markdown libero (testo lungo) |
| `tags`           | `string[]`                                                                                  | Filtraggio ricerca            |
| `visibility`     | `'gm_only' \| 'shared' \| 'public_canon'`                                                   |                               |
| `linkedEntities` | `EntityRef[]`                                                                               | Cross-link                    |

### NarrativeSeed (Spunto narrativo)

Sorgente POC: `spunti/*.md`. Nuova entità ([ADR 0005](../adr/0005-system-agnostic-domain-model.md)).

| Campo            | Tipo                                                             | Note                       |
| ---------------- | ---------------------------------------------------------------- | -------------------------- |
| `id`             | `NarrativeSeedId`                                                |                            |
| `campaignId`     | `CampaignId`                                                     |                            |
| `title`          | `string`                                                         |                            |
| `summary`        | `string`                                                         | Una frase / paragrafo      |
| `status`         | `'idea' \| 'planned' \| 'introduced' \| 'closed' \| 'discarded'` | Workflow seed → canon      |
| `linkedEntities` | `EntityRef[]`                                                    | PG, PNG, Luoghi coinvolti  |
| `body`           | `string?`                                                        | Dettaglio esteso opzionale |
| `tags`           | `string[]`                                                       |                            |

Quando uno spunto diventa `introduced`, deve essere collegato a una `Session` e ai resoconti rilevanti (campo `firstSessionId`).

### Session recap

Sorgente POC: `resoconti/sessione-NNN.md`. Mappato sulla `Session` esistente + record correlati:

| Campo                        | Note                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `Session.title`              | "Sessione 003" o titolo evocativo                                                            |
| `Session.summary`            | `## Riassunto`                                                                               |
| `Session.eventsBody`         | Corpo markdown di `## Eventi principali` (MVP: testo intero, non `SessionEvent[]` tipizzati) |
| `Session.locationsVisited[]` | `LocationId[]` da `## Luoghi visitati`                                                       |
| `Session.npcsEncountered[]`  | `NpcId[]` da `## Personaggi non giocanti incontrati`                                         |
| `Session.gmNotes`            | `## Note per la prossima sessione` (o `## Note DM` se presente)                              |
| `Session.publicSummary?`     | Riassunto player-safe (MVP: copia di `summary`)                                              |
| `Session.playedAt?`          | Da `**Data:**` nel header (formato IT `DD/MM/YYYY`)                                          |
| `CampaignImage`              | Scene da `## Immagini salienti` (`###` = titolo, link a `Session`)                           |
| `Session.canonDiff`          | Futuro: `CanonDiff` in chiusura sessione (non popolato dall'import)                          |

## Mapping POC → Amber Coffer

| Sezione Markdown POC                                    | Campo Amber Coffer                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `**Regione:**`, `**Ambito:**`, `**Promemoria:**` (PNG)  | `Npc.region`, `Npc.scope`, `Npc.reminder`                                                        |
| `**Razza/Classe:**`, `**Ruolo:**` (PG, PNG)             | `species`, `roleHint` (liberi)                                                                   |
| `## Immagine`                                           | `image: ImageRef`                                                                                |
| `## Aspetto`                                            | `appearance.description`                                                                         |
| `## Riferimento visivo`                                 | `appearance.visualReference.prompt`                                                              |
| `## Personalità`                                        | `appearance.personality`                                                                         |
| `## Legami con i PG` (PNG)                              | `Npc.linksToCharacters[]`                                                                        |
| `## Note DM`                                            | `gmNotes` (entity-level)                                                                         |
| `## Eventi interessanti`                                | `eventsInteresting[]`                                                                            |
| `## Scheda di gioco` (PNG)                              | `gameStats` (libero, niente schema 5e — [ADR 0005](../adr/0005-system-agnostic-domain-model.md)) |
| `## Riassunto` (resoconti)                              | `Session.summary`                                                                                |
| `## Ganci narrativi`, `## Segreti e obiettivi nascosti` | `Session.gmNotes`                                                                                |
| `## Luoghi visitati`                                    | `Session.locationsVisited`                                                                       |
| `## Immagini salienti` (resoconti)                      | `Session.images[]` con `imageRef`                                                                |
| `**Tipo:**`, `**Popolazione:**` (luoghi)                | `Location.kind`, `Location.population`                                                           |
| `## Economia e commercio`, `## Fazioni e potere`, ecc.  | `Location.sections[]` (libere)                                                                   |

Questo mapping è la **specifica** del tool di import markdown che verrà scritto in Fase 5 ([ADR 0007](../adr/) sarà creato lì).

## Convenzioni di naming sui file generati (post-import o export)

Quando l'utente esporta entità o genera asset, i nomi di file derivati seguono lo stile del POC:

- Slug: kebab-case ASCII di `name` (es. `Maren Halverson` → `maren-halverson`).
- Resoconti numerati: `sessione-NNN.md` (zero-padded a 3 cifre).
- Immagini: `<entityKind>/<slug>.<ext>` (es. `npcs/maren-halverson.webp`).
- Per immagini di scena: `events/<sessionId>/<event-slug>.<ext>`.

Niente di tutto questo è fisicamente sul disco utente fino all'export; il riferimento canonico è sempre il record SQLite + `imageRef`.

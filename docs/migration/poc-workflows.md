---
title: Workflow del POC tradotti in chiave Amber Coffer
status: bozza
canonical: true
---

# POC workflow → Amber Coffer

Riassunto dei flussi operativi del POC `_readonly/campagna-poc/` con la **traduzione in feature del prodotto**. Le skill Cursor del POC sono procedure narrative per agenti AI: in Amber Coffer diventano UI interattiva con persistenza tipizzata.

## 1. `/resoconto` — chiusura sessione (POC: `campagna-resoconto/SKILL.md`, 215 righe)

**POC**: dopo la sessione, l'agente legge `sessione/trascrizione.md` (fonte primaria se presente, altrimenti appunti DM), produce `resoconti/sessione-NNN.md` strutturato, aggiorna le schede PG/PNG citate, svuota `sessione/`, opzionalmente pubblica filtrato sul sito pubblico.

**Amber Coffer**: feature `master-app/features/session-recap/` (post-MVP).

| Step POC                                 | Equivalente Amber Coffer                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Lettura `sessione/trascrizione.md`       | Query `transcripts` per `session_id` corrente                                                                                          |
| Strutturazione resoconto in fasi         | UI wizard: "Riassunto", "Eventi salienti", "Luoghi visitati", "PNG incontrati", "Note DM"                                              |
| Aggiornamento schede personaggi          | Suggerimenti automatici (LLM Bedrock futuro) di patch su `npcs.events_interesting` con `## Eventi interessanti`                        |
| Svuotamento `sessione/` (PNG temporanei) | Canonicalizzazione: i PNG creati con `kind='scratch'` durante la sessione vengono promossi a `kind='canonical'`                        |
| Pubblicazione player-safe                | Marca `visibility: 'public_canon'` sulle entità citate → trigger upload S3 L3 (vedi [ADR 0006](../adr/0006-image-storage-strategy.md)) |

Concetto chiave: **canon diff**. Il resoconto produce un `CanonDiff` (tipo già presente in `packages/shared/src/narrative/canon-diff.ts`) che descrive le modifiche allo stato del mondo. Approvato dal GM → applicato.

## 2. `/trascrizione` + `/trascrizione-vc` — STT (POC: `campagna-trascrizione/SKILL.md` + `campagna-trascrizione-vc/SKILL.md`)

**POC**:

- Variante **mono** (`/trascrizione`): pulisce uno stream STT grezzo senza inventare nulla.
- Variante **dual-track** (`/trascrizione-vc`): pulisce `sessione/trascrizione-grezza-doppia.txt` (output di `transcribe_session_dual.py`) a chunk, con verifica master, append in `sessione/trascrizione.md`.

**Amber Coffer**: sidecar `tools/sidecars/whisper/` + UI master-app, **estensibile a N sorgenti audio** ([ADR 0004](../adr/0004-audio-source-extensibility.md)). Il POC scaricava modelli Hugging Face manualmente (`HF_TOKEN`, `.env`); il prodotto usa **Impostazioni → Modelli locali** e un catalogo con checksum ([ADR 0010](../adr/0010-local-model-artifacts-and-updates.md)).

| Aspetto POC                                                               | Amber Coffer MVP                                                                                                                                                           |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transcribe_session_dual.py` con Whisper + pyannote per burst             | Sidecar Rust che spawna processo Python identico, ma con contratto `AudioSource[]` in input e `Transcript` strutturato in output                                           |
| Pulizia interattiva a chunk con verifica master                           | UI "Transcript review": chunk paginati, edit inline, marker di progresso persistente in `transcripts.review_state`                                                         |
| `--player-offset-ms` per allineamento                                     | Campo `clockOffsetMs` su `AudioSource`, applicato dal sidecar prima del merge                                                                                              |
| Hugging Face `HF_TOKEN` in `.env` (diarizzazione pyannote, fuori MVP STT) | Non richiesto per Whisper MVP; diarizzazione post-MVP. Modelli STT: catalogo progetto, non token HF utente ([ADR 0010](../adr/0010-local-model-artifacts-and-updates.md)). |

## 3. `/ingame` — modalità tavolo (POC: `campagna-ingame/SKILL.md`, 146 righe)

**POC**: durante la sessione, risposte brevi, file consultabili solo sotto `sessione/`, niente narrazione lunga. Può interrogare l'MCP `dnd` per regole 5e.

**Amber Coffer**: feature `master-app/features/live-session/`.

- Vista "Live": ricerca rapida globale su tutte le entità (`characters`, `npcs`, `locations`, `factions`, `lore_notes`, `narrative_seeds`).
- Filtro automatico per `currentSessionId`: privilegia entità citate nei resoconti recenti o create durante la sessione corrente.
- **Niente MCP `dnd`**: il prodotto è system-agnostic ([ADR 0005](../adr/0005-system-agnostic-domain-model.md)). Eventuale lookup regole 5e è responsabilità dell'utente (browser separato, libri).
- Possibile integrazione futura LLM Bedrock per Q&A sul canon (stub `infrastructure/lib/stacks/ai-bedrock.ts`).

## 4. `/master` — authoring ambientazione (POC: `campagna-master/SKILL.md`, 128 righe)

**POC**: gli appunti del DM diventano documenti strutturati in `ambientazione/concetti/`, `luoghi/`, `nazioni/`. Format markdown rigoroso.

**Amber Coffer**: feature `master-app/features/world-builder/`.

- Editor strutturato per `Location`, `Faction`, `LoreNote` ([ADR 0005](../adr/0005-system-agnostic-domain-model.md)).
- Template-driven: i template canonici vivono in [entity-templates.md](./entity-templates.md) (Fase 3).
- Markdown libero come campo `body` (long-form), ma metadati strutturati (regione, tipo, status).

## 5. `/prompt-immagine` + `/importa-immagine` — pipeline visuale (POC: `campagna-immagini/SKILL.md`, 257 righe)

**POC**: il DM genera prompt in **inglese** per modelli image, importa il JPEG risultante, normalizza orientamento EXIF e dimensioni, aggiorna i Markdown.

**Amber Coffer**: feature `master-app/features/visual-references/`.

| Step POC                                                             | Amber Coffer                                                                                                                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sezione `## Riferimento visivo` con ` ```text` in italiano-narrativo | Campo `visualReference.prompt: string` (libero, in inglese se l'utente preferisce — **eccezione lingua confermata**)                                                                       |
| Generazione esterna (Midjourney, SDXL, ecc.)                         | Out of scope MVP. L'utente importa il file finito. Possibile integrazione futura via Bedrock Image.                                                                                        |
| Import + normalizzazione JPEG                                        | Pipeline `images.rs` (Rust + `image` crate o `imagemagick` sidecar): EXIF orientation, resize max 4000px, WebP secondario. Storage L1 ([ADR 0006](../adr/0006-image-storage-strategy.md)). |
| Aggiornamento path nel markdown                                      | Update transazionale del record entità con `imageRef` opaco.                                                                                                                               |

**Convenzione "tratti fissi vs stato di scena"** (dalla rule `personaggio-aspetto.mdc`): preservata.

- `Appearance` e `VisualReference` contengono solo **tratti permanenti**.
- Stati di scena (emozioni, pose, vestiti di sessione) finiscono in `Npc.eventsInteresting[]` o nei resoconti.

Questa è una **regola di dominio** che andrà nella Fase 3 (`entity-templates.md`) e potenzialmente in una rule Cursor dedicata.

## 6. Public canon (POC: `tools/scripts/build_public_site.py` + `tools/pubblicazione/manifest.json`)

**POC**: genera un sito Jekyll filtrato (allowlist PNG/luoghi conosciuti, rimozione `## Note DM`, `## Ganci narrativi`, `## Segreti`). Deploy su GitHub Pages via Actions.

**Amber Coffer**: stack CDK `public-canon` (`infrastructure/lib/stacks/public-canon.ts`, stub).

- Trigger: GM marca entità/resoconti come `visibility: 'public_canon'` → master-app genera HTML statico filtrato + upload S3 L3.
- Filtraggio sezioni DM = funzione di "redaction" nel servizio Rust, non rule Cursor.
- **Non Jekyll**: stack pubblico definito in CDK, generazione HTML lato master-app (Rust + template) o Lambda futura.

## Sintesi: regole Cursor che NON si portano come obblighi

| Rule POC                                          | Motivo                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `png-scheda-gioco.mdc` (schema 5e obbligatorio)   | Prodotto system-agnostic ([ADR 0005](../adr/0005-system-agnostic-domain-model.md)) |
| `campagna.mdc` (ambientazione Far West specifica) | Specifica di quella campagna, non del prodotto                                     |
| Riferimenti a MCP `dnd`                           | Out of scope ([ADR 0005](../adr/0005-system-agnostic-domain-model.md))             |

## Regole/convenzioni che SI portano (in `entity-templates.md`, Fase 3)

- Sezione `## Eventi interessanti` con voci `**[Sessione NNN]** Descrizione.`
- Convenzione "tratti fissi vs stato di scena" su Appearance.
- Metadati strutturati su PNG (`Regione`, `Ambito`, `Promemoria`, `Razza/Classe`, `Ruolo`) → campi tipizzati su `Npc`.
- Struttura `## Riassunto / ## Eventi / ## Luoghi visitati / ## Note DM` sui resoconti.
- Path immagini relativo a campagna, mai assoluto.

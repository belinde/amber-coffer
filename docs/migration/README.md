---
title: Migrazione da progetti legacy
status: in corso
canonical: true
---

# Migrazione legacy verso Amber Coffer

Cartella temporanea con la documentazione di **import** dai progetti legacy. Stato symlink in [`_readonly/`](../../_readonly/README.md):

- **POC markdown live** (`_readonly/campagna-poc/`, alias di `/home/belinde/Campagna`) — campagna D&D 5e gestita interamente in Markdown + skill Cursor. **Symlink attivo**: fonte di fixture per la Fase 5.
- **Monorepo cloud abbandonato** (`/home/belinde/Projects/_amber-coffer`) — MVP webapp con tabletop, WebRTC, WebSocket signaling e CDK. **Symlink rimosso in Fase 6**: tutto il valore tabletop è stato portato; il delta resta in [legacy-cloud-delta.md](./legacy-cloud-delta.md) e [tabletop-porting-notes.md](./tabletop-porting-notes.md). Ricreabile via `ln -sfn` per analisi puntuali.

## Indice

| Documento | Stato | Scopo |
|-----------|-------|-------|
| [inventory.md](./inventory.md) | completato | Matrice funzioni legacy → target Amber Coffer |
| [poc-workflows.md](./poc-workflows.md) | completato | Workflow chiave del POC (resoconto, trascrizione, immagini) in chiave Amber Coffer |
| [legacy-cloud-delta.md](./legacy-cloud-delta.md) | completato | Cosa portare, cosa scartare, motivazioni rispetto alla cloud MVP |
| [entity-templates.md](./entity-templates.md) | completato | Template canonici per PG, PNG, Luoghi, Fazioni, LoreNote, NarrativeSeed (ex regole POC) |
| [tabletop-porting-notes.md](./tabletop-porting-notes.md) | completato (Fase 4a) | Note di port di `TabletopBoard` e `gameMode/*` da React/WS a Amber+MQTT |

ADR collegati: vedi [`docs/adr/`](../adr/) (numerazione `0004+` riservata alla migrazione).

## Principi guida

1. **Adatta, non clonare**: ogni import attraversa l'architettura corrente (Tauri + Rust SQLite + MQTT + Discord Activity).
2. **Domande prima del codice**: per qualunque import non banale **fermarsi e usare `AskQuestion`** (vedi [`.cursor/rules/05-readonly-legacy.mdc`](../../.cursor/rules/05-readonly-legacy.mdc)).
3. **Inventario è la fonte di verità**: nessun file legacy entra nel codice nuovo senza una riga in [inventory.md](./inventory.md) con decisione e fase.
4. **ADR per scelte non triviali**: import di dati, port di codice, scelte di pipeline → ADR dedicato.
5. **Niente dipendenza permanente da `_readonly/`**: tutto il materiale importato vive sotto `docs/`, `packages/shared/`, `apps/**` o `tools/**`. I symlink scompaiono in Fase 6.

## Stato fasi

| Fase | Descrizione | Stato |
|------|-------------|-------|
| 0 | Setup symlink + rule Cursor | completata |
| 1 | Inventario funzionale | completata |
| 2 | Documentazione canonica (workflow, delta, ADR 0004–0006) | completata |
| 3 | Regole/skill Cursor dal POC → rules + entity-templates | completata |
| 4a | Analisi tabletop legacy | completata |
| 4b | Port codice tabletop in `master-app`/`player-activity` | completata |
| 5 | ADR 0007 + tool import markdown (extract + `import_campaign_dump`) | completata |
| 6 | Cleanup symlink legacy-cloud + verifica | completata; POC resta vivo fino a chiusura Fase 5 |

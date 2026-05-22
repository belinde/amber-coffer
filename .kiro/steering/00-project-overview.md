---
inclusion: always
---

# Amber Coffer — Panoramica progetto

Narrative OS local-first per Game Master (vedi `docs/blueprint.md`, `docs/functional-specs.md`).

## Struttura monorepo

- `apps/master-app` — Schermo del master (Tauri 2 + React, GM, logica autoritativa)
- `apps/player-activity` — Tavolo di gioco (React + Discord SDK, viewer tattico stateless)
- `packages/shared` — tipi + Zod (contratti)
- `infrastructure` — AWS CDK
- `docs/` — documentazione di progetto in **italiano**

## ESLint

Config **unica** in [eslint.config.mjs](mdc:eslint.config.mjs) (root). Ogni nuovo workspace: aggiornare glob + script `lint` — vedi [.cursor/rules/15-eslint-monorepo.mdc](mdc:.cursor/rules/15-eslint-monorepo.mdc).

## Regole invarianti

1. **Codice in inglese** (identifier, commenti, log). UI multilingua IT/EN/FR/ES.
2. **SQLite solo in Rust** (`sqlx`). React usa `invoke()` via `bridge/`.
3. **Branded IDs** (UUID v7) da `packages/shared`.
4. **Dipendenze minime** — giustificare ogni nuova libreria.
5. **Nessuna logica di business** negli stub: `unimplemented!()` / TODO espliciti.

## Vocabolario

Nei tipi: `Character` (PG), `Npc` (PNG), `Location`, `Faction`, `Item`, `Relationship`, `LoreNote`, `NarrativeSeed`.
Vedi `docs/glossary.md`.

## Documenti collegati

- [docs/migration/](mdc:docs/migration/) — inventario e decisioni di migrazione dai legacy
- [docs/migration/entity-templates.md](mdc:docs/migration/entity-templates.md) — template canonici di campi per le entità
- [.cursor/rules/05-readonly-legacy.mdc](mdc:.cursor/rules/05-readonly-legacy.mdc) — regole per `_readonly/`
- [.cursor/rules/45-entity-conventions.mdc](mdc:.cursor/rules/45-entity-conventions.mdc) — convenzioni di dominio entità
- [.cursor/rules/15-eslint-monorepo.mdc](mdc:.cursor/rules/15-eslint-monorepo.mdc) — glob e script lint per nuovi workspace

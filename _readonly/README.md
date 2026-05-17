# `_readonly/` — accesso temporaneo ai progetti legacy

Questa cartella contiene **symlink di sola lettura** verso progetti esterni utilizzati come fonte per la migrazione verso Amber Coffer. **NON è canonica**, **non viene committata**, e i target NON devono essere modificati.

## Symlink attivi

| Alias | Target reale | Ruolo |
|-------|--------------|-------|
| [campagna-poc](./campagna-poc) | `/home/belinde/Campagna` | POC markdown live (PG, PNG, luoghi, resoconti, `.cursor/`, `tools/scripts`). **Ancora vivo**: fixture per `tools/migrate-from-poc/` (Fase 5). |

## Symlink rimossi

| Alias | Quando | Motivo | Riferimenti residui |
|-------|--------|--------|----------------------|
| `legacy-cloud` (→ `/home/belinde/Projects/_amber-coffer`) | Fase 6, dopo chiusura Fase 4b | Tabletop portato in [`@amber/tabletop-engine`](../packages/tabletop-engine/) + feature `tabletop-control`/`tabletop`. Tutto il resto era già `DISCARD` o `REFERENCE` enumerato. | [docs/migration/legacy-cloud-delta.md](../docs/migration/legacy-cloud-delta.md), [docs/migration/tabletop-porting-notes.md](../docs/migration/tabletop-porting-notes.md), [docs/migration/inventory.md](../docs/migration/inventory.md) §2 |

## Regole

1. **Sola lettura**: nessuna scrittura sotto `_readonly/**`. Vedi [`.cursor/rules/05-readonly-legacy.mdc`](../.cursor/rules/05-readonly-legacy.mdc).
2. **Non committare**: i target sono in `.gitignore`. Verifica con `git status`.
3. **Niente copy-paste cieco**: ogni import passa per inventario e ADR (vedi [`docs/migration/`](../docs/migration/)).
4. **Esclusioni dure dal POC**:
   - audio sessione (`campagna-poc/sessione/audio/**`)
   - segreti: `.env*`, token Hugging Face

## Ricreare un symlink rimosso

Se un'analisi futura richiede di ri-aprire un legacy già rimosso (ad esempio per ri-leggere gli handler in `_amber-coffer/apps/backend/src/handlers/`), il symlink si ricrea in un comando:

```bash
cd /home/belinde/Projects/amber-coffer
ln -sfn /home/belinde/Projects/_amber-coffer _readonly/legacy-cloud
```

Stessa procedura per il POC se viene spostato:

```bash
ln -sfn /percorso/nuovo/Campagna _readonly/campagna-poc
```

## Quando rimuovere anche il POC

A chiusura **Fase 5** (implementazione completa di `tools/migrate-from-poc/` con extractor reali e fixture import effettuata):

```bash
rm _readonly/campagna-poc
rmdir _readonly  # se vuoto
```

Le decisioni e la documentazione restano in `docs/migration/` e `docs/adr/`.

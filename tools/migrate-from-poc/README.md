# `tools/migrate-from-poc`

Estrattore TypeScript per importare una campagna Markdown del POC in un **dump JSON** validato con gli Zod schema di `@amber/shared`, poi persistenza via Tauri.

Vedi [ADR 0007](../../docs/adr/0007-markdown-campaign-import.md) e [entity-templates.md](../../docs/migration/entity-templates.md).

## Pipeline

```
POC Markdown tree
       │
       ▼  (stadio 1 — questo tool)
  Parse + Zod validate
       │
       ▼
   campaign-dump.json
       │
       ▼  (stadio 2 — `import_campaign_dump`)
   SQLite locale + asset L1
```

La campagna target è **«La corsa al Nuovo Mondo»** (`POC_CAMPAIGN_NAME` in `@amber/shared`). Lo stadio 2 la trova per nome o la crea; lo stadio 1 richiede lo stesso `campaignId` nel dump.

## Uso

```bash
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use
pnpm install

pnpm --filter @amber/shared build
pnpm --filter @amber/migrate-from-poc build

# 1a. In master-app (DevTools / bridge): crea o trova la campagna POC
#     const { campaignId } = await ensurePocCampaign();

# 1b. Estrai (risolve l'id da nome se omesso --campaign-id):
pnpm --filter @amber/migrate-from-poc run extract -- \
  --source /home/belinde/Campagna \
  --output ./campaign-dump.json

# Oppure con id esplicito:
pnpm --filter @amber/migrate-from-poc run extract -- \
  --source /home/belinde/Campagna \
  --campaign-id <uuid-v7> \
  --output ./campaign-dump.json

# 2. Import in SQLite (master-app bridge):
# importCampaignDump({ dumpPath: '/path/to/campaign-dump.json' })
# → find/create «La corsa al Nuovo Mondo», import, report.campaignCreated
```

Opzioni extract: `--campaign-name` (default `La corsa al Nuovo Mondo`), `--strict` (abort se `errors[]` non vuoto).

`playerDiscordId` sui PG resta `null` dopo l'import: assegnare gli ID Discord a mano in master-app (`Giocatore` nel POC è solo informativo).

## Output

```jsonc
{
  "version": 1,
  "sourceMeta": { "rootPath": "...", "extractedAt": 0, "files": 47 },
  "campaignId": "...",
  "entities": {
    /* ... */
  },
  "assets": [],
  "warnings": [],
  "errors": [],
}
```

## In scope

- `personaggi/`, `png/` (no `INDICE.md`), `ambientazione/luoghi|nazioni|concetti/`, `ambientazione/ambientazione-giocatori.md`, `spunti/`, `resoconti/`, `immagini/**`

## Fuori scope

- Audio `sessione/audio/`, trascrizioni, `.cursor/`, tooling Python

## Convenzioni

- **Idempotente**: `<source>/.amber-mapping.json` (gitignored nel POC) mappa path file → UUID v7 stabili.
- **Errori non bloccanti** (default): vedi `errors[]` / `warnings[]` nel dump.

## Test

```bash
pnpm --filter @amber/migrate-from-poc test
```

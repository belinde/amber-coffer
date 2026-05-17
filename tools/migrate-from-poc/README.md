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

## Uso

```bash
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use
pnpm install

pnpm --filter @amber/shared build
pnpm --filter @amber/migrate-from-poc build

# Genera un campaignId (UUID v7)
pnpm --filter @amber/shared exec node -e "import('@amber/shared').then(m => console.log(m.generateUuidV7()))"

# 1. Crea la campagna nel master-app con quell'id, poi estrai (scrivi sempre campaign-dump.json in tools/migrate-from-poc/):
export AMBER_CAMPAIGN_ID=<uuid-v7>
pnpm --filter @amber/migrate-from-poc run extract -- --source /home/belinde/Campagna

# Oppure tutto esplicito:
pnpm --filter @amber/migrate-from-poc run extract -- \
  --source /home/belinde/Campagna \
  --campaign-id <uuid-v7> \
  --output ./campaign-dump.json

# 2. Import in SQLite (da master-app / DevTools o bridge):
# importCampaignDump({ dumpPath: '...', campaignId: '<uuid>' })
```

Opzioni: `--strict` abortisce se `errors[]` non è vuoto.

## Output

```jsonc
{
  "version": 1,
  "sourceMeta": { "rootPath": "...", "extractedAt": 0, "files": 47 },
  "campaignId": "...",
  "entities": {
    "characters": [],
    "npcs": [],
    "locations": [],
    "factions": [],
    "loreNotes": [],
    "narrativeSeeds": [],
    "sessions": [],
    "campaignImages": []
  },
  "assets": [{ "entityKind": "npc", "entityId": "...", "sourcePath": "...", "relativeLocal": "..." }],
  "warnings": [],
  "errors": []
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

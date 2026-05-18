# Amber Discord Bot (local recorder)

Local sidecar that joins a campaign voice channel and records per-participant audio for Amber Coffer sessions.

## Which Discord application?

| Application                 | Owner             | Used for                                                                                                             |
| --------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Amber Coffer** (product)  | Amber Coffer team | Master setup OAuth + Player Activity Embedded App — see [ADR 0012](../../docs/adr/0012-amber-discord-application.md) |
| **GM recording bot** (BYOB) | Each Game Master  | This process — token in Master Screen Settings → Discord                                                             |

The recorder **always** uses the **GM’s bot token**, not the Amber Coffer Application ID. The Master App wizard helps the GM create that bot, invite it to a server, and pick a voice channel per campaign.

## Setup

1. In Master Screen: **Settings → Discord** — follow the guided bot token steps (or create an app at [Discord Developer Portal](https://discord.com/developers/applications) manually).
2. Bot permissions for invite: `Connect`, `Speak`, `Use Voice Activity` — see `GM_BOT_INVITE_PERMISSIONS` in `@amber/shared` (Speak is required for start/stop recording announcements).
3. Set **table language** (`playLanguage` on the campaign): used for VC announcements and transcription hint.
4. Complete the **campaign connection** wizard (OAuth → server → invite bot → voice channel), or paste a channel ID in Advanced.
5. Never commit tokens.

## Build

```bash
pnpm --filter @amber/discord-bot build
```

### Recording announcements (OGG assets)

Pre-generated files under `assets/announcements/<locale>/recording-{start,stop}.ogg`. Regenerate with [espeak-ng](https://github.com/espeak-ng/espeak-ng) (female variant `f3` by default):

```bash
pnpm --filter @amber/discord-bot generate:announcements
```

Voices use `espeak-ng --voices=variant` combined with the table language base voice, e.g. `it+f3`, `en-gb+f3`. Override variant: `ESPEAK_VARIANT=Linda pnpm --filter @amber/discord-bot generate:announcements`.

## CLI (also spawned by master-app)

```bash
export DISCORD_BOT_TOKEN="..."
node dist/cli.js record \
  --channel-id "123456789012345678" \
  --session-id "019..." \
  --output-dir "/path/to/worlds/<storageUuid>/sessions/<n>" \
  --locale it
```

`--locale` matches campaign `playLanguage` (`it`, `en`, `fr`, `es`). On join, the bot plays the start announcement; on `stop` it plays the goodbye clip before writing the manifest.

Send `stop` on stdin to end recording and write `audio/manifest.json`.

## Output layout

- `audio/discord/<discordUserId>/<NNNN>.ogg` — Opus chunks (manifest v2)
- `audio/manifest.json`
- Legacy v1: `audio/discord/<discordUserId>.wav`

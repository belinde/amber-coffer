# Amber Discord Bot (local recorder)

Local-sidecar bot that joins a campaign voice channel and records per-participant audio for Amber Coffer sessions.

## Setup

1. Create a [Discord Application](https://discord.com/developers/applications) and add a Bot user.
2. Enable **Message Content Intent** is not required; enable **Server Members Intent** if display names fail.
3. Bot permissions: `Connect`, `Speak` (optional), `Use Voice Activity`.
4. Invite the bot to your server with a URL that includes `bot` scope and voice permissions.
5. Copy the bot token into The Coffer (Settings → Discord bot token). Never commit tokens.

## Build

```bash
pnpm --filter @amber/discord-bot build
```

## CLI (also spawned by master-app)

```bash
export DISCORD_BOT_TOKEN="..."
node dist/cli.js record \
  --channel-id "123456789012345678" \
  --session-id "019..." \
  --output-dir "/path/to/campaigns/<campaignId>/sessions/<n>"
```

Send `stop` on stdin to end recording and write `audio/manifest.json`.

## Output layout

- `audio/discord/<discordUserId>.wav`
- `audio/manifest.json`

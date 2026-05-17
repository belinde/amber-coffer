#!/usr/bin/env node
import { parseArgs } from 'node:util';

import { runRecordSession } from './record.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'channel-id': { type: 'string' },
    'session-id': { type: 'string' },
    'output-dir': { type: 'string' },
    'token-env': { type: 'string', default: 'DISCORD_BOT_TOKEN' },
  },
});

async function main(): Promise<void> {
  const command = positionals[0];
  if (command !== 'record') {
    console.error('Usage: amber-discord-bot record --channel-id <id> --session-id <id> --output-dir <path>');
    process.exit(1);
  }

  const channelId = values['channel-id'];
  const sessionId = values['session-id'];
  const outputDir = values['output-dir'];
  const tokenEnv = values['token-env'] ?? 'DISCORD_BOT_TOKEN';

  if (!channelId || !sessionId || !outputDir) {
    console.error('Missing required flags: --channel-id, --session-id, --output-dir');
    process.exit(1);
  }

  const token = process.env[tokenEnv];
  if (!token?.trim()) {
    console.error(`Environment variable ${tokenEnv} is not set`);
    process.exit(1);
  }

  await runRecordSession({
    token: token.trim(),
    channelId,
    sessionId,
    outputDir,
  });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

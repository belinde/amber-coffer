#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { extractCampaign } from './extract.js';
import type { ExtractError, ExtractWarning } from './types.js';

type CliArgs = {
  source: string;
  campaignId: string;
  output: string;
  strict: boolean;
};

const TOOL_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

function defaultPocSource(): string | undefined {
  const candidates = [
    resolve(TOOL_ROOT, '../../_readonly/campagna-poc'),
    '/home/belinde/Campagna',
  ];
  return candidates.find((path) => existsSync(path));
}

function parseCliArgs(argv: string[]): CliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      source: { type: 'string' },
      'campaign-id': { type: 'string' },
      output: { type: 'string' },
      strict: { type: 'boolean', default: false },
    },
    strict: true,
  });

  const sourceRaw = values.source ?? process.env.AMBER_POC_SOURCE ?? defaultPocSource();
  const campaignId = values['campaign-id'] ?? process.env.AMBER_CAMPAIGN_ID;
  const outputRaw = values.output ?? process.env.AMBER_DUMP_OUTPUT ?? 'campaign-dump.json';

  if (!sourceRaw || !campaignId) {
    process.stderr.write(
      [
        'Usage: amber-migrate-from-poc --source <path> --campaign-id <uuid-v7> [--output <file>] [--strict]',
        '',
        'Defaults:',
        '  --output ./campaign-dump.json (relative to cwd)',
        '  --source $AMBER_POC_SOURCE or _readonly/campagna-poc when present',
        '  --campaign-id $AMBER_CAMPAIGN_ID',
        '',
      ].join('\n'),
    );
    process.exit(2);
  }

  return {
    source: resolve(sourceRaw),
    campaignId,
    output: resolve(outputRaw),
    strict: Boolean(values.strict),
  };
}

function printIssues(label: string, issues: ExtractWarning[] | ExtractError[]): void {
  if (issues.length === 0) return;
  process.stderr.write(`\n${label} (${issues.length}):\n`);
  for (const issue of issues) {
    const cause = 'cause' in issue && issue.cause ? ` — ${issue.cause}` : '';
    process.stderr.write(`  ${issue.file}: ${issue.message}${cause}\n`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== '--');
  const args = parseCliArgs(argv);
  const dump = await extractCampaign({
    rootPath: args.source,
    campaignId: args.campaignId,
    strict: args.strict,
  });

  await mkdir(dirname(args.output), { recursive: true });
  await writeFile(args.output, JSON.stringify(dump, null, 2), 'utf8');

  const { entities, warnings, errors } = dump;
  const totals = Object.fromEntries(
    Object.entries(entities).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
  );
  process.stdout.write(`Wrote ${args.output}\n`);
  process.stdout.write(`Source: ${args.source}\n`);
  process.stdout.write(`Entities: ${JSON.stringify(totals)}\n`);
  process.stdout.write(`Assets: ${dump.assets.length}\n`);
  process.stdout.write(`Warnings: ${warnings.length}, errors: ${errors.length}\n`);

  printIssues('Warnings', warnings);
  printIssues('Errors', errors);

  if (args.strict && errors.length > 0) {
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err: unknown) => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

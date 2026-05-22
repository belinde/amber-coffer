#!/usr/bin/env node
import { resolve } from 'node:path';

import { buildPublicCanonSite, loadPublicCanonPayload } from './build-site.js';

function printUsage(): void {
  console.error(`Usage: amber-build-public-canon --input <campaign-public.json> --out <dist-dir>`);
}

function parseArgs(argv: string[]): { input: string; out: string } | null {
  let input: string | undefined;
  let out: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') {
      input = argv[i + 1];
      i += 1;
    } else if (arg === '--out') {
      out = argv[i + 1];
      i += 1;
    }
  }

  if (!input || !out) return null;
  return { input: resolve(input), out: resolve(out) };
}

const args = parseArgs(process.argv.slice(2));
if (!args) {
  printUsage();
  process.exit(1);
}

const payload = loadPublicCanonPayload(args.input);
buildPublicCanonSite(args.out, payload);
console.log(`Public canon site written to ${args.out}`);

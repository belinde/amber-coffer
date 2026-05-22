import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const themeCss = readFileSync(join(__dirname, 'amber-theme.css'), 'utf8');

const REQUIRED_TOKENS = [
  '--bg: #12100d',
  '--panel: #1a1713',
  '--accent: #d39c4a',
  '--text: #f5efe5',
  '--font-family: Georgia',
  '--font-size-root: 18px',
  'color-scheme: dark only',
] as const;

describe('amber-theme.css', () => {
  it('includes canonical POC palette tokens', () => {
    for (const token of REQUIRED_TOKENS) {
      expect(themeCss).toContain(token);
    }
  });
});

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { bundleUiCss } from './bundle-ui-css.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_ENTRY = join(__dirname, '../../../packages/ui/src/styles/index.css');

describe('bundleUiCss', () => {
  it('produces a single stylesheet without @import', () => {
    const bundled = bundleUiCss(UI_ENTRY);
    expect(bundled).not.toMatch(/@import\s+['"]/);
    expect(bundled).toContain('--accent: #d39c4a');
    expect(bundled).toContain('.page-card');
  });
});

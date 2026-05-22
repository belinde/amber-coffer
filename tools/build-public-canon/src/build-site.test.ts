import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildPublicCanonSite, loadPublicCanonPayload } from './build-site.js';

describe('buildPublicCanonSite', () => {
  it('writes static HTML without a React client bundle', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'public-canon-'));
    const fixture = new URL('../fixtures/sample-campaign-public.json', import.meta.url);
    const payload = loadPublicCanonPayload(fixture.pathname);

    buildPublicCanonSite(outDir, payload);

    const home = readFileSync(join(outDir, 'index.html'), 'utf8');
    expect(home).toContain('Sample Campaign');
    expect(home).toContain('/assets/ui.css');
    expect(home).not.toContain('react-dom/client');
    expect(home).not.toContain('type="module"');

    const uiCss = readFileSync(join(outDir, 'assets', 'ui.css'), 'utf8');
    expect(uiCss).not.toMatch(/@import\s+['"]/);
    expect(uiCss).toContain('--bg: #12100d');
    expect(uiCss).toContain('.entity-card');

    const character = readFileSync(join(outDir, 'personaggi/aldric/index.html'), 'utf8');
    expect(character).toContain('Aldric Vale');
  });
});

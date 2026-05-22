import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';

import { bundleUiCss } from './bundle-ui-css.js';
import {
  renderCharacterDetail,
  renderCharactersHub,
  renderHomePage,
  renderSessionsHub,
} from './pages.js';
import {
  publicCanonPayloadSchema,
  type PublicCanonPayload,
} from './public-canon-payload.schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_STYLES = resolve(__dirname, '../../../packages/ui/src/styles/index.css');

function htmlDocument(title: string, bodyMarkup: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark only" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/assets/ui.css" />
  </head>
  <body>
    <div id="root">${bodyMarkup}</div>
  </body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function writePage(outDir: string, relativePath: string, title: string, markup: string): void {
  const filePath = join(outDir, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, htmlDocument(title, markup), 'utf8');
}

export function buildPublicCanonSite(outDir: string, payload: PublicCanonPayload): void {
  mkdirSync(join(outDir, 'assets'), { recursive: true });
  writeFileSync(join(outDir, 'assets', 'ui.css'), bundleUiCss(UI_STYLES), 'utf8');

  writePage(
    outDir,
    'index.html',
    payload.campaignTitle,
    renderToStaticMarkup(renderHomePage(payload)),
  );

  writePage(
    outDir,
    'personaggi/index.html',
    `Characters — ${payload.campaignTitle}`,
    renderToStaticMarkup(renderCharactersHub(payload)),
  );

  for (const character of payload.characters) {
    const page = renderCharacterDetail(payload, character.slug);
    if (!page) continue;
    writePage(
      outDir,
      `personaggi/${character.slug}/index.html`,
      `${character.title} — ${payload.campaignTitle}`,
      renderToStaticMarkup(page),
    );
  }

  writePage(
    outDir,
    'resoconti/index.html',
    `Sessions — ${payload.campaignTitle}`,
    renderToStaticMarkup(renderSessionsHub(payload)),
  );
}

export function loadPublicCanonPayload(inputPath: string): PublicCanonPayload {
  const raw: unknown = JSON.parse(readFileSync(inputPath, 'utf8'));
  return publicCanonPayloadSchema.parse(raw);
}

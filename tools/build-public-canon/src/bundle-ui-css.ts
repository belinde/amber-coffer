import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const IMPORT_RE = /@import\s+['"]([^'"]+)['"]\s*;/g;

/**
 * Inlines `@import` chains so static hosting serves a single self-contained stylesheet.
 * Vite bundles this automatically for React apps; the SSG output must do it explicitly.
 */
export function bundleUiCss(entryPath: string): string {
  const seen = new Set<string>();

  function load(filePath: string): string {
    const absolute = resolve(filePath);
    if (seen.has(absolute)) {
      return '';
    }
    seen.add(absolute);

    const css = readFileSync(absolute, 'utf8');
    const dir = dirname(absolute);

    return css.replace(IMPORT_RE, (_match, importPath: string) => load(resolve(dir, importPath)));
  }

  return load(entryPath);
}

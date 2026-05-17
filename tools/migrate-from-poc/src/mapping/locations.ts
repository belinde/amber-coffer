import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { locationSchema, type Location } from '@amber/shared';

import { readMarkdownFile, sectionBody } from '../frontmatter.js';
import { resolveFileId } from '../id-mapping.js';
import type { ExtractContext } from '../types.js';

import {
  buildAppearance,
  buildEventsInteresting,
  fail,
  freeformSections,
  nowTimestamps,
  queueImageFromSection,
  relPath,
} from './common.js';

export async function extractLocations(ctx: ExtractContext): Promise<Location[]> {
  const dir = join(ctx.rootPath, 'ambientazione', 'luoghi');
  const entries = await readdir(dir, { withFileTypes: true });
  const locations: Location[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const absPath = join(dir, entry.name);
    const relFile = relPath(ctx.rootPath, absPath);
    ctx.fileCount++;

    try {
      const parsed = await readMarkdownFile(absPath);
      const id = resolveFileId(ctx.mapping, relFile);
      const slug = entry.name.replace(/\.md$/, '');
      const timestamps = nowTimestamps();

      const location: Location = {
        id: id as Location['id'],
        campaignId: ctx.campaignId as Location['campaignId'],
        parentId: null,
        name: parsed.title,
        region: parsed.metadata.Regione?.trim() || null,
        kind: parsed.metadata.Tipo?.trim() || null,
        population: parsed.metadata.Popolazione?.trim() || null,
        appearance: buildAppearance(parsed),
        sections: freeformSections(parsed),
        eventsInteresting: buildEventsInteresting(parsed, ctx.registry, timestamps.createdAt),
        image: null,
        visibility: 'gm_only',
        description: sectionBody(parsed, 'Descrizione') || null,
        coordinates: null,
        ...timestamps,
        version: 1,
      };

      queueImageFromSection(ctx, relFile, 'location', id, sectionBody(parsed, 'Immagine'));

      ctx.registry.register({ kind: 'location', id, name: parsed.title, slug });

      locations.push(locationSchema.parse(location));
    } catch (err) {
      fail(ctx, relFile, 'Failed to parse location', err instanceof Error ? err.message : String(err));
    }
  }

  return locations;
}

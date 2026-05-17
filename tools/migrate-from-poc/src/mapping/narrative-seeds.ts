import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { narrativeSeedSchema, type NarrativeSeed } from '@amber/shared';

import { readMarkdownFile, sectionBody } from '../frontmatter.js';
import { resolveFileId } from '../id-mapping.js';
import type { ExtractContext } from '../types.js';

import { fail, nowTimestamps, relPath } from './common.js';

export async function extractNarrativeSeeds(ctx: ExtractContext): Promise<NarrativeSeed[]> {
  const dir = join(ctx.rootPath, 'spunti');
  const entries = await readdir(dir, { withFileTypes: true });
  const seeds: NarrativeSeed[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (entry.name.toUpperCase() === 'README.MD') continue;

    const absPath = join(dir, entry.name);
    const relFile = relPath(ctx.rootPath, absPath);
    ctx.fileCount++;

    try {
      const parsed = await readMarkdownFile(absPath);
      const id = resolveFileId(ctx.mapping, relFile);
      const slug = entry.name.replace(/\.md$/, '');
      const timestamps = nowTimestamps();
      const tags: string[] = [];
      if (parsed.metadata.Tipo) tags.push(parsed.metadata.Tipo.toLowerCase());

      const seed: NarrativeSeed = {
        id: id as NarrativeSeed['id'],
        campaignId: ctx.campaignId as NarrativeSeed['campaignId'],
        title: parsed.title,
        summary: sectionBody(parsed, 'Descrizione').slice(0, 2000) || parsed.title,
        status: 'idea',
        body: parsed.sections.map((s) => `## ${s.heading}\n\n${s.body}`).join('\n\n'),
        tags,
        linkedEntities: [],
        firstSessionId: null,
        ...timestamps,
        version: 1,
      };

      ctx.registry.register({ kind: 'narrative_seed', id, name: parsed.title, slug });

      seeds.push(narrativeSeedSchema.parse(seed));
    } catch (err) {
      fail(
        ctx,
        relFile,
        'Failed to parse narrative seed',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return seeds;
}

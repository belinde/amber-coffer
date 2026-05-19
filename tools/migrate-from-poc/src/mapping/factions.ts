import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { type factionKindSchema, factionSchema, type Faction } from '@amber/shared';
import type { z } from 'zod';

import { readMarkdownFile, sectionBody } from '../frontmatter.js';
import { resolveFileId } from '../id-mapping.js';
import type { ExtractContext } from '../types.js';

import {
  buildEventsInteresting,
  fail,
  nowTimestamps,
  queuePortraitAsCampaignImage,
  relPath,
} from './common.js';

type FactionKind = z.infer<typeof factionKindSchema>;

function factionKindFromSlug(slug: string): FactionKind | null {
  if (slug.includes('stati-uniti') || slug.includes('nazione')) return 'state';
  if (slug.includes('regno') || slug.includes('kingdom')) return 'kingdom';
  if (slug.includes('compagnia') || slug.includes('company')) return 'company';
  if (slug.includes('gilda') || slug.includes('guild')) return 'guild';
  if (slug.includes('culto') || slug.includes('cult')) return 'cult';
  if (slug.includes('famiglia') || slug.includes('family')) return 'family';
  return 'other';
}

const SECRET_HEADINGS = ['segreti e obiettivi nascosti', 'segreti'];
const GOAL_HEADINGS = ['descrizione e scopo', 'risorse e influenza', 'ganci narrativi'];

export async function extractFactions(ctx: ExtractContext): Promise<Faction[]> {
  const dir = join(ctx.rootPath, 'ambientazione', 'nazioni');
  const entries = await readdir(dir, { withFileTypes: true });
  const factions: Faction[] = [];

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

      const secretsParts: string[] = [];
      const goalsParts: string[] = [];
      const descriptionParts: string[] = [];

      for (const section of parsed.sections) {
        const key = section.heading.toLowerCase();
        if (SECRET_HEADINGS.some((h) => key.includes(h))) {
          secretsParts.push(section.body);
        } else if (GOAL_HEADINGS.some((h) => key.includes(h))) {
          goalsParts.push(`## ${section.heading}\n\n${section.body}`);
        } else if (key !== 'immagine') {
          descriptionParts.push(`## ${section.heading}\n\n${section.body}`);
        }
      }

      const faction: Faction = {
        id: id as Faction['id'],
        campaignId: ctx.campaignId as Faction['campaignId'],
        name: parsed.title,
        kind: factionKindFromSlug(slug),
        parentFactionId: null,
        headquartersLocationId: null,
        goals: goalsParts.join('\n\n').trim(),
        secrets: secretsParts.join('\n\n').trim(),
        description: descriptionParts.join('\n\n').trim() || null,
        eventsInteresting: buildEventsInteresting(parsed, ctx.registry, timestamps.createdAt),
        image: null,
        visibility: 'gm_only',
        ...timestamps,
        version: 1,
      };

      queuePortraitAsCampaignImage(
        ctx,
        relFile,
        'faction',
        id,
        parsed.title,
        sectionBody(parsed, 'Immagine'),
      );

      ctx.registry.register({ kind: 'faction', id, name: parsed.title, slug });

      factions.push(factionSchema.parse(faction));
    } catch (err) {
      fail(
        ctx,
        relFile,
        'Failed to parse faction',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return factions;
}

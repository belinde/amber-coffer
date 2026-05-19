import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { characterSchema, type Character } from '@amber/shared';

import { readMarkdownFile, sectionBody } from '../frontmatter.js';
import { resolveFileId } from '../id-mapping.js';
import type { ExtractContext } from '../types.js';

import {
  buildAppearance,
  buildEventsInteresting,
  buildGmNotes,
  fail,
  nowTimestamps,
  parseNotableEquipment,
  parseRazzaClasse,
  queuePortraitAsCampaignImage,
  relPath,
} from './common.js';

export async function extractCharacters(ctx: ExtractContext): Promise<Character[]> {
  const dir = join(ctx.rootPath, 'personaggi');
  const entries = await readdir(dir, { withFileTypes: true });
  const characters: Character[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const absPath = join(dir, entry.name);
    const relFile = relPath(ctx.rootPath, absPath);
    ctx.fileCount++;

    try {
      const parsed = await readMarkdownFile(absPath);
      const id = resolveFileId(ctx.mapping, relFile);
      const slug = entry.name.replace(/\.md$/, '');
      const { species, roleHint } = parseRazzaClasse(parsed.metadata);
      const timestamps = nowTimestamps();

      const character: Character = {
        id: id as Character['id'],
        campaignId: ctx.campaignId as Character['campaignId'],
        name: parsed.title,
        playerDiscordId: null,
        currentLocationId: null,
        species,
        roleHint: roleHint ?? parsed.metadata.Ruolo?.trim() ?? null,
        appearance: buildAppearance(parsed),
        gameStats: {},
        gameSystemHint: 'dnd5e',
        notableEquipment: parseNotableEquipment(parsed),
        eventsInteresting: buildEventsInteresting(parsed, ctx.registry, timestamps.createdAt),
        image: null,
        gmNotes: buildGmNotes(parsed),
        visibility: 'gm_only',
        status: 'active',
        ...timestamps,
        version: 1,
      };

      queuePortraitAsCampaignImage(
        ctx,
        relFile,
        'character',
        id,
        parsed.title,
        sectionBody(parsed, 'Immagine'),
      );

      ctx.registry.register({
        kind: 'character',
        id,
        name: parsed.title,
        slug,
      });

      characters.push(characterSchema.parse(character));
    } catch (err) {
      fail(
        ctx,
        relFile,
        'Failed to parse character',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return characters;
}

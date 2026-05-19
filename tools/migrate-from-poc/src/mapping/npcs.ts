import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { npcSchema, type Character, type Npc } from '@amber/shared';

import { readMarkdownFile, parseGameStats, sectionBody } from '../frontmatter.js';
import { resolveFileId } from '../id-mapping.js';
import type { ExtractContext } from '../types.js';

import {
  buildAppearance,
  buildEventsInteresting,
  buildGmNotes,
  fail,
  nowTimestamps,
  parseRazzaClasse,
  queuePortraitAsCampaignImage,
  relPath,
  warn,
} from './common.js';

function parseLinksToCharacters(
  body: string,
  ctx: ExtractContext,
  relFile: string,
): Npc['linksToCharacters'] {
  const links: Npc['linksToCharacters'] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) continue;
    const match = /^\*\*([^*]+)\*\*[:\s—-]*(.*)$/.exec(trimmed.replace(/^-\s*/, ''));
    if (!match) continue;
    const charName = match[1]!.trim();
    const charId = ctx.registry.resolveCharacterName(charName);
    if (!charId) {
      warn(ctx, relFile, `Could not resolve character link "${charName}"`);
      continue;
    }
    links.push({
      characterId: charId as Character['id'],
      description: match[2]?.trim() ?? '',
    });
  }
  return links;
}

export async function extractNpcs(ctx: ExtractContext): Promise<Npc[]> {
  const dir = join(ctx.rootPath, 'png');
  const entries = await readdir(dir, { withFileTypes: true });
  const npcs: Npc[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (entry.name.toUpperCase() === 'INDICE.MD') continue;

    const absPath = join(dir, entry.name);
    const relFile = relPath(ctx.rootPath, absPath);
    ctx.fileCount++;

    try {
      const parsed = await readMarkdownFile(absPath);
      const id = resolveFileId(ctx.mapping, relFile);
      const slug = entry.name.replace(/\.md$/, '');
      const { species, roleHint } = parseRazzaClasse(parsed.metadata);
      const timestamps = nowTimestamps();

      const npc: Npc = {
        id: id as Npc['id'],
        campaignId: ctx.campaignId as Npc['campaignId'],
        name: parsed.title,
        currentLocationId: null,
        factionId: null,
        species,
        roleHint: roleHint ?? parsed.metadata.Ruolo?.trim() ?? null,
        region: parsed.metadata.Regione?.trim() || null,
        scope: parsed.metadata.Ambito?.trim() || null,
        reminder: parsed.metadata.Promemoria?.trim() || null,
        recordKind: 'canonical',
        appearance: buildAppearance(parsed),
        gameStats: parseGameStats(sectionBody(parsed, 'Scheda di gioco')),
        gameSystemHint: 'dnd5e',
        notableEquipment: [],
        linksToCharacters: parseLinksToCharacters(
          sectionBody(parsed, 'Legami con i PG'),
          ctx,
          relFile,
        ),
        eventsInteresting: buildEventsInteresting(parsed, ctx.registry, timestamps.createdAt),
        image: null,
        gmNotes: buildGmNotes(parsed),
        visibility: 'gm_only',
        status: 'alive',
        disposition: null,
        description: null,
        ...timestamps,
        version: 1,
      };

      queuePortraitAsCampaignImage(
        ctx,
        relFile,
        'npc',
        id,
        parsed.title,
        sectionBody(parsed, 'Immagine'),
      );

      ctx.registry.register({ kind: 'npc', id, name: parsed.title, slug });

      npcs.push(npcSchema.parse(npc));
    } catch (err) {
      fail(ctx, relFile, 'Failed to parse npc', err instanceof Error ? err.message : String(err));
    }
  }

  return npcs;
}

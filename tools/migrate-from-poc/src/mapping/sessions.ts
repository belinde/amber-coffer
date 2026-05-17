import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  campaignImageSchema,
  generateUuidV7,
  sessionSchema,
  type CampaignImage,
  type Location,
  type Npc,
  type Session,
} from '@amber/shared';

import {
  parseImageMarkdown,
  parseItalianDate,
  parseSessionImageBlocks,
  readMarkdownFile,
  sectionBody,
} from '../frontmatter.js';
import { resolveFileId } from '../id-mapping.js';
import {
  resolveSessionLocationIds,
  resolveSessionNpcIds,
} from '../session-resolve.js';
import type { ExtractContext } from '../types.js';

import { fail, nowTimestamps, relPath } from './common.js';

export type SessionExtractResult = {
  sessions: Session[];
  campaignImages: CampaignImage[];
};

function sessionNumberFromFilename(name: string): number | null {
  const match = /^sessione-(\d+)\.md$/i.exec(name);
  if (!match) return null;
  return Number.parseInt(match[1]!, 10);
}

/** Register session IDs before entity files reference Eventi interessanti. */
export async function preregisterSessions(ctx: ExtractContext): Promise<void> {
  const dir = join(ctx.rootPath, 'resoconti');
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const number = sessionNumberFromFilename(entry.name);
    if (number === null) continue;
    const absPath = join(dir, entry.name);
    const relFile = relPath(ctx.rootPath, absPath);
    const id = resolveFileId(ctx.mapping, relFile);
    const slug = `sessione-${String(number).padStart(3, '0')}`;
    ctx.registry.register({
      kind: 'session',
      id,
      name: `Sessione ${String(number).padStart(3, '0')}`,
      slug,
    });
  }
}

export async function extractSessions(ctx: ExtractContext): Promise<SessionExtractResult> {
  const dir = join(ctx.rootPath, 'resoconti');
  const entries = await readdir(dir, { withFileTypes: true });
  const sessions: Session[] = [];
  const campaignImages: CampaignImage[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const number = sessionNumberFromFilename(entry.name);
    if (number === null) continue;

    const absPath = join(dir, entry.name);
    const relFile = relPath(ctx.rootPath, absPath);
    ctx.fileCount++;

    try {
      const parsed = await readMarkdownFile(absPath);
      const id = resolveFileId(ctx.mapping, relFile);
      const slug = `sessione-${String(number).padStart(3, '0')}`;
      const timestamps = nowTimestamps();
      const playedAt = parseItalianDate(parsed.metadata);

      const titleMatch = /^Sessione\s+\d+\s*[—–-]\s*(.+)$/i.exec(parsed.title);
      const title = titleMatch?.[1]?.trim() ?? parsed.title;

      const summary = sectionBody(parsed, 'Riassunto');
      const eventsBody = sectionBody(parsed, 'Eventi principali');
      const gmNotes =
        sectionBody(parsed, 'Note per la prossima sessione') ||
        sectionBody(parsed, 'Note DM');

      const locationsVisited = resolveSessionLocationIds(
        ctx,
        relFile,
        sectionBody(parsed, 'Luoghi visitati'),
      ) as Location['id'][];
      const npcsEncountered = resolveSessionNpcIds(
        ctx,
        relFile,
        sectionBody(parsed, 'Personaggi non giocanti incontrati'),
      ) as Npc['id'][];

      const session: Session = {
        id: id as Session['id'],
        campaignId: ctx.campaignId as Session['campaignId'],
        number,
        title,
        status: 'published',
        startedAt: playedAt,
        endedAt: playedAt,
        summary,
        eventsBody,
        gmNotes,
        publicSummary: summary || null,
        locationsVisited,
        npcsEncountered,
        playedAt,
        ...timestamps,
        version: 1,
      };

      ctx.registry.register({ kind: 'session', id, name: parsed.title, slug });

      sessions.push(sessionSchema.parse(session));

      const imagesSection = sectionBody(parsed, 'Immagini salienti');
      for (const block of parseSessionImageBlocks(imagesSection)) {
        const imageId = generateUuidV7();
        const timestampsImg = nowTimestamps();
        const captionMatch = /\*([^*]+)\*/.exec(block.body);
        const caption = captionMatch?.[1]?.trim() ?? '';

        const campaignImage: CampaignImage = {
          id: imageId as CampaignImage['id'],
          campaignId: ctx.campaignId as CampaignImage['campaignId'],
          title: block.title,
          caption,
          image: null,
          links: [{ kind: 'session', id: id as Session['id'] }],
          visibility: 'gm_only',
          ...timestampsImg,
          version: 1,
        };

        campaignImages.push(campaignImageSchema.parse(campaignImage));

        const image = parseImageMarkdown(block.body);
        if (image?.path) {
          const pocPath = image.path.startsWith('/') ? image.path.slice(1) : image.path;
          const sourcePath = join(ctx.rootPath, pocPath);
          const ext = pocPath.includes('.') ? pocPath.slice(pocPath.lastIndexOf('.')) : '.jpg';
          ctx.assets.push({
            entityKind: 'campaign_image',
            entityId: imageId,
            sourcePath,
            relativeLocal: `${ctx.campaignId}/${imageId}/original${ext}`,
          });
        }
      }
    } catch (err) {
      fail(ctx, relFile, 'Failed to parse session', err instanceof Error ? err.message : String(err));
    }
  }

  sessions.sort((a, b) => a.number - b.number);
  return { sessions, campaignImages };
}

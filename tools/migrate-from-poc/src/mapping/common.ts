import { join, relative } from 'node:path';

import {
  campaignImageSchema,
  type Appearance,
  type CampaignImage,
  type Character,
  type EventReference,
  type ImageLink,
  type Location,
  type Npc,
} from '@amber/shared';

import {
  parseEventiInteressanti,
  parseFencedText,
  parseImageMarkdown,
  type ParsedMarkdownFile,
  sectionBody,
} from '../frontmatter.js';
import { resolvePortraitImageId } from '../id-mapping.js';
import type { EntityRegistry } from '../registry.js';
import type { DumpAssetEntityKind, ExtractContext, ExtractError } from '../types.js';

const STANDARD_SECTIONS = new Set([
  'immagine',
  'aspetto',
  'riferimento visivo',
  'personalità',
  'equipaggiamento notevole',
  'eventi interessanti',
  'note dm',
  'scheda di gioco',
  'legami con i pg',
  'legami con i personaggi giocanti',
  'legami con gli altri pg',
]);

export function nowTimestamps(): { createdAt: number; updatedAt: number } {
  const t = Date.now();
  return { createdAt: t, updatedAt: t };
}

export function buildAppearance(parsed: ParsedMarkdownFile): Appearance {
  const aspetto = sectionBody(parsed, 'Aspetto');
  const personality = sectionBody(parsed, 'Personalità');
  const visualBody = sectionBody(parsed, 'Riferimento visivo');
  const prompt = parseFencedText(visualBody) || visualBody.trim();

  return {
    description: aspetto,
    personality,
    permanentMarks: [],
    visualReference: { prompt },
  };
}

export function buildGmNotes(parsed: ParsedMarkdownFile): string {
  return sectionBody(parsed, 'Note DM');
}

/** Bullet lines from `## Equipaggiamento notevole` (markdown stripped to plain text). */
export function parseNotableEquipment(parsed: ParsedMarkdownFile): string[] {
  const body = sectionBody(parsed, 'Equipaggiamento notevole');
  if (!body.trim()) return [];

  const items: string[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) continue;
    const text = trimmed
      .replace(/^-\s*/, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\s+—\s+.*$/, '')
      .trim();
    if (text) items.push(text);
  }
  return items;
}

export function parseRazzaClasse(metadata: Record<string, string>): {
  species: string | null;
  roleHint: string | null;
} {
  const raw = metadata['Razza/Classe'] ?? metadata.Razza ?? '';
  if (!raw || raw === '—' || raw === '-') {
    return { species: metadata.Razza?.trim() || null, roleHint: metadata.Classe?.trim() || null };
  }
  const parts = raw.split('/').map((p) => p.trim());
  return {
    species: parts[0] || null,
    roleHint: parts[1] && parts[1] !== '—' ? parts[1] : metadata.Ruolo?.trim() || null,
  };
}

export function buildEventsInteresting(
  parsed: ParsedMarkdownFile,
  registry: EntityRegistry,
  occurredAt: number,
): EventReference[] {
  const body = sectionBody(parsed, 'Eventi interessanti');
  const parsedEvents = parseEventiInteressanti(body);
  const result: EventReference[] = [];

  for (const ev of parsedEvents) {
    const sessionId = registry.sessionIdForNumber(ev.sessionNumber);
    if (!sessionId) continue;
    result.push({
      sessionId: sessionId as EventReference['sessionId'],
      summary: ev.summary,
      occurredAt,
    });
  }
  return result;
}

type PortraitEntityKind = Exclude<DumpAssetEntityKind, 'campaign_image'>;

function portraitLink(entityKind: PortraitEntityKind, entityId: string): ImageLink | null {
  switch (entityKind) {
    case 'character':
      return { kind: 'character', id: entityId as Character['id'] };
    case 'npc':
      return { kind: 'npc', id: entityId as Npc['id'] };
    case 'location':
      return { kind: 'location', id: entityId as Location['id'] };
    case 'faction':
      return null;
    default:
      return null;
  }
}

/**
 * Portrait from `## Immagine` → archive `CampaignImage` + L1 asset on that row.
 * Entity `image` is set at import time via `portraitBindings` (same `ImageRef` as the archive).
 */
export function queuePortraitAsCampaignImage(
  ctx: ExtractContext,
  entityRelFile: string,
  entityKind: PortraitEntityKind,
  entityId: string,
  entityTitle: string,
  sectionBodyText: string,
): void {
  const parsed = parseImageMarkdown(sectionBodyText);
  if (!parsed?.path) return;

  const imageId = resolvePortraitImageId(ctx.mapping, entityRelFile);
  const pocPath = parsed.path.startsWith('/') ? parsed.path.slice(1) : parsed.path;
  const sourcePath = join(ctx.rootPath, pocPath);
  const ext = pocPath.includes('.') ? pocPath.slice(pocPath.lastIndexOf('.')) : '.jpg';
  const link = portraitLink(entityKind, entityId);
  const timestamps = nowTimestamps();

  const campaignImage: CampaignImage = {
    id: imageId as CampaignImage['id'],
    campaignId: ctx.campaignId as CampaignImage['campaignId'],
    title: entityTitle,
    caption: parsed.alt.trim(),
    image: null,
    links: link ? [link] : [],
    visibility: 'gm_only',
    ...timestamps,
    version: 1,
  };

  ctx.portraitCampaignImages.push(campaignImageSchema.parse(campaignImage));
  ctx.portraitBindings.push({
    entityKind,
    entityId,
    campaignImageId: imageId,
  });

  ctx.assets.push({
    entityKind: 'campaign_image',
    entityId: imageId,
    sourcePath,
    relativeLocal: `${ctx.campaignId}/${imageId}/original${ext}`,
  });
}

export function freeformSections(
  parsed: ParsedMarkdownFile,
): Array<{ title: string; body: string }> {
  return parsed.sections
    .filter((s) => !STANDARD_SECTIONS.has(s.heading.toLowerCase()))
    .map((s) => ({ title: s.heading, body: s.body }));
}

export function relPath(rootPath: string, absPath: string): string {
  return relative(rootPath, absPath).replace(/\\/g, '/');
}

export function warn(ctx: ExtractContext, file: string, message: string): void {
  ctx.warnings.push({ file, message });
}

export function fail(ctx: ExtractContext, file: string, message: string, cause?: string): void {
  const err: ExtractError = { file, message };
  if (cause !== undefined) err.cause = cause;
  ctx.errors.push(err);
}

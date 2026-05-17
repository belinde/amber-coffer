import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { type loreNoteKindSchema, loreNoteSchema, type LoreNote } from '@amber/shared';
import type { z } from 'zod';

import { readMarkdownFile } from '../frontmatter.js';
import { resolveFileId } from '../id-mapping.js';
import type { ExtractContext } from '../types.js';

import { fail, nowTimestamps, relPath } from './common.js';

type LoreNoteKind = z.infer<typeof loreNoteKindSchema>;

function loreKindFromSlug(slug: string): LoreNoteKind {
  const s = slug.toLowerCase();
  if (s.includes('religione')) return 'religion';
  if (s.includes('economia') || s.includes('commercio')) return 'economy';
  if (s.includes('geografia')) return 'concept';
  if (s.includes('storia')) return 'history';
  if (s.includes('tecnomagia') || s.includes('magia')) return 'concept';
  if (s.includes('cultura') || s.includes('societa')) return 'culture';
  if (s.includes('cosmologia') || s.includes('geometria-planare')) return 'cosmology';
  return 'custom';
}

function loreTagsFromSlug(slug: string): string[] {
  const tags: string[] = [];
  const s = slug.toLowerCase();
  if (s.includes('geografia')) tags.push('geography');
  if (s.includes('tecnomagia') || s.includes('magia')) tags.push('magic');
  return tags;
}

async function extractLoreFile(
  ctx: ExtractContext,
  absPath: string,
  extraTags: string[] = [],
): Promise<LoreNote | null> {
  const relFile = relPath(ctx.rootPath, absPath);
  ctx.fileCount++;

  try {
    const parsed = await readMarkdownFile(absPath);
    const id = resolveFileId(ctx.mapping, relFile);
    const slug = absPath.split('/').pop()?.replace(/\.md$/, '') ?? '';
    const timestamps = nowTimestamps();
    const tags = [...loreTagsFromSlug(slug), ...extraTags];

    const body = parsed.sections.map((s) => `## ${s.heading}\n\n${s.body}`).join('\n\n').trim();

    const note: LoreNote = {
      id: id as LoreNote['id'],
      campaignId: ctx.campaignId as LoreNote['campaignId'],
      title: parsed.title,
      kind: loreKindFromSlug(slug),
      body,
      tags,
      visibility: 'gm_only',
      linkedEntities: [],
      ...timestamps,
      version: 1,
    };

    ctx.registry.register({ kind: 'lore_note', id, name: parsed.title, slug });

    return loreNoteSchema.parse(note);
  } catch (err) {
    fail(ctx, relFile, 'Failed to parse lore note', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function extractLoreNotes(ctx: ExtractContext): Promise<LoreNote[]> {
  const notes: LoreNote[] = [];

  const concettiDir = join(ctx.rootPath, 'ambientazione', 'concetti');
  const concetti = await readdir(concettiDir, { withFileTypes: true });
  for (const entry of concetti) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const note = await extractLoreFile(ctx, join(concettiDir, entry.name));
    if (note) notes.push(note);
  }

  const playerBrief = join(ctx.rootPath, 'ambientazione', 'ambientazione-giocatori.md');
  try {
    await stat(playerBrief);
    const note = await extractLoreFile(ctx, playerBrief, ['player-briefing']);
    if (note) notes.push(note);
  } catch {
    // optional file
  }

  return notes;
}

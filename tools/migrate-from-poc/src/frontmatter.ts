import { readFile } from 'node:fs/promises';

export type MarkdownSection = {
  heading: string;
  level: number;
  body: string;
};

export type ParsedMarkdownFile = {
  title: string;
  metadata: Record<string, string>;
  sections: MarkdownSection[];
  rawBody: string;
};

const METADATA_RE = /^\*\*([^*]+):\*\*\s*(.+)$/;
const SESSION_EVENT_RE = /^\*\*\[Sessione\s+(\d+)\]\*\*\s*(.+)$/;

export async function readMarkdownFile(absPath: string): Promise<ParsedMarkdownFile> {
  const rawBody = await readFile(absPath, 'utf8');
  return parseMarkdown(rawBody);
}

export function parseMarkdown(rawBody: string): ParsedMarkdownFile {
  const lines = rawBody.replace(/\r\n/g, '\n').split('\n');
  let title = '';
  const metadata: Record<string, string> = {};
  const sections: MarkdownSection[] = [];

  let i = 0;
  while (i < lines.length && !lines[i]?.trim()) i++;

  if (i < lines.length && lines[i]!.startsWith('# ')) {
    title = lines[i]!.slice(2).trim();
    i++;
  }

  const metaLines: string[] = [];
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith('## ')) break;
    if (line.trim()) metaLines.push(line);
    i++;
  }

  for (const line of metaLines) {
    const match = METADATA_RE.exec(line.trim());
    if (match) {
      metadata[match[1]!.trim()] = match[2]!.trim();
    }
  }

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith('## ')) {
      const heading = line.slice(3).trim();
      i++;
      const bodyLines: string[] = [];
      while (i < lines.length && !lines[i]!.startsWith('## ')) {
        bodyLines.push(lines[i]!);
        i++;
      }
      sections.push({ heading, level: 2, body: bodyLines.join('\n').trim() });
    } else {
      i++;
    }
  }

  return { title, metadata, sections, rawBody };
}

export function sectionBody(parsed: ParsedMarkdownFile, heading: string): string {
  const section = parsed.sections.find((s) => s.heading.toLowerCase() === heading.toLowerCase());
  return section?.body ?? '';
}

export function parseImageMarkdown(body: string): { alt: string; path: string } | null {
  const match = /!\[([^\]]*)\]\(([^)]+)\)/.exec(body);
  if (!match) return null;
  return { alt: match[1] ?? '', path: match[2] ?? '' };
}

/** Return ALL `![alt](path)` occurrences in a section body. */
export function parseAllImages(body: string): Array<{ alt: string; path: string }> {
  const results: Array<{ alt: string; path: string }> = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    results.push({ alt: match[1] ?? '', path: match[2] ?? '' });
  }
  return results;
}

export function parseFencedText(body: string, lang = 'text'): string {
  const re = new RegExp(`\`\`\`${lang}\\s*\\n([\\s\\S]*?)\`\`\``, 'i');
  const match = re.exec(body);
  return match?.[1]?.trim() ?? '';
}

export type ParsedSessionEvent = {
  sessionNumber: number;
  summary: string;
};

export function parseEventiInteressanti(body: string): ParsedSessionEvent[] {
  const events: ParsedSessionEvent[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) continue;
    const match = SESSION_EVENT_RE.exec(trimmed.replace(/^-\s*/, ''));
    if (match) {
      events.push({
        sessionNumber: Number.parseInt(match[1]!, 10),
        summary: match[2]!.trim(),
      });
    }
  }
  return events;
}

export function parseGameStats(body: string): Record<string, string | number | boolean | null> {
  const stats: Record<string, string | number | boolean | null> = {};
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bold = /^\*\*([^*]+):\*\*\s*(.+)$/.exec(trimmed);
    if (bold) {
      stats[bold[1]!.trim()] = bold[2]!.trim();
      continue;
    }
    const plain = /^([^:]+):\s*(.+)$/.exec(trimmed);
    if (plain) {
      stats[plain[1]!.trim()] = plain[2]!.trim();
    }
  }
  return stats;
}

const ANONYMOUS_MARKER_RE = /\((anonim|senza nome)/i;

export type BulletRef = {
  primary: string;
  alternateNames: string[];
  anonymous: boolean;
};

/** Bullet lines: `- **Name** — rest`, optional `*Also known as*` and `(anonimo)` markers. */
export function parseBulletRefs(body: string): BulletRef[] {
  const refs: BulletRef[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('-')) continue;
    const content = trimmed.replace(/^-\s*/, '');
    const bold = /^\*\*([^*]+)\*\*/.exec(content);
    if (!bold) continue;

    const primary = bold[1]!.trim();
    const anonymous = ANONYMOUS_MARKER_RE.test(content);
    const alternateNames: string[] = [];
    const rest = content.slice(bold[0].length);
    const italicRe = /\*([^*]+)\*/g;
    let match: RegExpExecArray | null;
    while ((match = italicRe.exec(rest)) !== null) {
      const name = match[1]!.trim();
      if (!/^(anonim|anonima|senza nome|steamboat)$/i.test(name)) {
        alternateNames.push(name);
      }
    }
    refs.push({ primary, alternateNames, anonymous });
  }
  return refs;
}

/** @deprecated Prefer {@link parseBulletRefs} for session recap resolution. */
export function parseBulletNames(body: string): string[] {
  return parseBulletRefs(body).map((ref) => ref.primary);
}

/** Parse `**Data:** DD/MM/YYYY` from metadata or header lines. */
export function parseItalianDate(metadata: Record<string, string>): number | null {
  const raw = metadata.Data ?? metadata.data;
  if (!raw) return null;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!match) return null;
  const day = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10) - 1;
  const year = Number.parseInt(match[3]!, 10);
  const ms = Date.UTC(year, month, day);
  return Number.isNaN(ms) ? null : ms;
}

/** Split session recap `## Immagini salienti` into sub-scenes (`###` headings). */
export function parseSessionImageBlocks(body: string): Array<{
  title: string;
  body: string;
}> {
  const blocks: Array<{ title: string; body: string }> = [];
  const parts = body.split(/^### /m).filter(Boolean);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    if (nl === -1) {
      blocks.push({ title: part.trim(), body: '' });
    } else {
      blocks.push({
        title: part.slice(0, nl).trim(),
        body: part.slice(nl + 1).trim(),
      });
    }
  }
  return blocks;
}

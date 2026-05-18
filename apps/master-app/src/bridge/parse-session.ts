import { sessionSchema, type Session } from '@amber/shared';
import { z } from 'zod';

const sessionWireSchema = z
  .object({
    locationsVisitedJson: z.string().optional(),
    npcsEncounteredJson: z.string().optional(),
    locationsVisited: z.array(z.string()).optional(),
    npcsEncountered: z.array(z.string()).optional(),
  })
  .passthrough();

function parseIdArray(raw: string | undefined, fallback: string[] | undefined): string[] {
  if (fallback !== undefined) {
    return fallback;
  }
  if (raw === undefined || raw.trim() === '') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Normalizes Tauri session rows (JSON columns) into the shared `Session` shape. */
export function parseSession(raw: unknown): Session {
  const wire = sessionWireSchema.parse(raw);
  const locationsVisited = parseIdArray(wire.locationsVisitedJson, wire.locationsVisited);
  const npcsEncountered = parseIdArray(wire.npcsEncounteredJson, wire.npcsEncountered);

  const { locationsVisitedJson: _lv, npcsEncounteredJson: _nv, ...rest } = wire;

  return sessionSchema.parse({
    ...rest,
    locationsVisited,
    npcsEncountered,
  });
}

import type { Campaign } from '@amber/shared';

import { listCharacters } from '../../bridge/characters.js';
import { listLocations } from '../../bridge/locations.js';
import { listNpcs } from '../../bridge/npcs.js';
import { listSessions } from '../../bridge/sessions.js';

import type { CampaignSubjectOption } from './types.js';

/** Subjects linkable from campaign images (PG, PNG, locations, sessions). */
export async function loadImageLinkSubjects(
  campaignId: Campaign['id'],
): Promise<CampaignSubjectOption[]> {
  const [characters, npcs, locations, sessions] = await Promise.all([
    listCharacters(campaignId),
    listNpcs(campaignId),
    listLocations(campaignId),
    listSessions(campaignId),
  ]);

  const sessionLabels = sessions
    .sort((a, b) => a.number - b.number)
    .map((s) => ({
      kind: 'session' as const,
      id: s.id,
      label: s.title?.trim()
        ? `#${s.number} — ${s.title.trim()}`
        : `#${s.number}`,
    }));

  return [
    ...characters.map((c) => ({ kind: 'character' as const, id: c.id, label: c.name })),
    ...npcs.map((n) => ({ kind: 'npc' as const, id: n.id, label: n.name })),
    ...locations.map((l) => ({ kind: 'location' as const, id: l.id, label: l.name })),
    ...sessionLabels,
  ].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

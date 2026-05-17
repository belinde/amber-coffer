import { describe, expect, it } from 'vitest';

import { appearanceSchema, defaultAppearance } from './appearance.schema.js';
import { characterSchema } from './character.schema.js';
import { eventReferenceSchema } from './event-reference.schema.js';
import { gameStatsSchema } from './game-stats.schema.js';
import { imageRefSchema } from './image-ref.schema.js';
import { loreNoteSchema } from './lore-note.schema.js';
import { narrativeSeedSchema } from './narrative-seed.schema.js';
import { visibilitySchema } from './visibility.schema.js';

const SAMPLE_SESSION_ID = '018f1234-5678-7abc-8def-123456789abc';
const SAMPLE_CAMPAIGN_ID = '018f1234-5678-7abc-8def-123456789abd';
const SAMPLE_CHARACTER_ID = '018f1234-5678-7abc-8def-123456789abe';

describe('world-state primitives', () => {
  it('parses visibility', () => {
    expect(visibilitySchema.parse('gm_only')).toBe('gm_only');
    expect(visibilitySchema.parse('public_canon')).toBe('public_canon');
  });

  it('parses appearance defaults', () => {
    const parsed = appearanceSchema.parse({});
    expect(parsed).toEqual(defaultAppearance);
  });

  it('parses image ref with null optional urls from Rust JSON', () => {
    const parsed = imageRefSchema.parse({
      local: 'campaign-id/image-id/original.jpg',
      hash: 'abc123',
      thumbnailUrl: null,
      canonUrl: null,
    });
    expect(parsed.local).toBe('campaign-id/image-id/original.jpg');
    expect(parsed.thumbnailUrl).toBeNull();
  });

  it('parses game stats record', () => {
    expect(gameStatsSchema.parse({ level: 5, name: 'Maren' })).toEqual({
      level: 5,
      name: 'Maren',
    });
  });

  it('parses event reference', () => {
    const event = eventReferenceSchema.parse({
      sessionId: SAMPLE_SESSION_ID,
      summary: 'Revealed Halverson link',
      occurredAt: 1_700_000_000_000,
    });
    expect(event.summary).toContain('Halverson');
  });

  it('round-trips character JSON sample', () => {
    const sample = {
      id: SAMPLE_CHARACTER_ID,
      campaignId: SAMPLE_CAMPAIGN_ID,
      name: 'Maren Halverson',
      playerDiscordId: null,
      currentLocationId: null,
      species: 'Human',
      roleHint: 'Gunslinger',
      appearance: {
        description: 'Tall and lean',
        permanentMarks: ['Scar over left eye'],
        visualReference: { prompt: 'cinematically realistic cowboy' },
      },
      gameStats: { level: 5 },
      gameSystemHint: 'dnd5e',
      notableEquipment: ['Revolver'],
      eventsInteresting: [
        {
          sessionId: SAMPLE_SESSION_ID,
          summary: 'Met the sheriff',
          occurredAt: 1_700_000_000_000,
        },
      ],
      image: null,
      gmNotes: 'Secret backstory',
      visibility: 'gm_only',
      status: 'active',
      createdAt: 1,
      updatedAt: 2,
      version: 1,
    };
    const parsed = characterSchema.parse(sample);
    expect(parsed.name).toBe('Maren Halverson');
    expect(parsed.appearance.permanentMarks).toHaveLength(1);
  });

  it('parses lore note and narrative seed', () => {
    const loreId = '018f1234-5678-7abc-8def-123456789abf';
    const seedId = '018f1234-5678-7abc-8def-123456789ab0';

    const lore = loreNoteSchema.parse({
      id: loreId,
      campaignId: SAMPLE_CAMPAIGN_ID,
      title: 'The Strain',
      kind: 'cosmology',
      body: 'Long-form lore',
      tags: ['magic'],
      visibility: 'shared',
      linkedEntities: [],
      createdAt: 1,
      updatedAt: 2,
      version: 1,
    });
    expect(lore.kind).toBe('cosmology');

    const seed = narrativeSeedSchema.parse({
      id: seedId,
      campaignId: SAMPLE_CAMPAIGN_ID,
      title: 'Silverton heist',
      summary: 'Rob the bank',
      status: 'idea',
      body: null,
      tags: [],
      linkedEntities: [],
      firstSessionId: null,
      createdAt: 1,
      updatedAt: 2,
      version: 1,
    });
    expect(seed.status).toBe('idea');
  });
});

import { generateUuidV7 } from '@amber/shared';
import { describe, expect, it } from 'vitest';

import { parseMarkdown } from '../frontmatter.js';
import { EntityRegistry } from '../registry.js';
import type { ExtractContext } from '../types.js';

import { queuePortraitAsCampaignImage } from './common.js';

const CAMPAIGN_ID = generateUuidV7();
const NPC_ID = generateUuidV7();

function minimalCtx(): ExtractContext {
  return {
    rootPath: '/tmp/poc',
    campaignId: CAMPAIGN_ID,
    strict: false,
    warnings: [],
    errors: [],
    registry: new EntityRegistry(),
    mapping: { version: 1, campaignId: CAMPAIGN_ID, files: {} },
    assets: [],
    portraitCampaignImages: [],
    portraitBindings: [],
    fileCount: 0,
  };
}

describe('queuePortraitAsCampaignImage', () => {
  it('creates archive row, asset, and binding with entity link', () => {
    const ctx = minimalCtx();
    const parsed = parseMarkdown(`# Maren

## Immagine

![Ritratto](/immagini/png/maren.jpg)
`);

    queuePortraitAsCampaignImage(
      ctx,
      'png/maren.md',
      'npc',
      NPC_ID,
      'Maren',
      parsed.sections.find((s) => s.heading === 'Immagine')?.body ?? '',
    );

    expect(ctx.portraitCampaignImages).toHaveLength(1);
    expect(ctx.portraitCampaignImages[0]?.title).toBe('Maren');
    expect(ctx.portraitCampaignImages[0]?.links).toEqual([{ kind: 'npc', id: NPC_ID }]);
    expect(ctx.portraitBindings).toEqual([
      { entityKind: 'npc', entityId: NPC_ID, campaignImageId: ctx.portraitCampaignImages[0]!.id },
    ]);
    expect(ctx.assets).toHaveLength(1);
    expect(ctx.assets[0]?.entityKind).toBe('campaign_image');
    expect(ctx.assets[0]?.entityId).toBe(ctx.portraitCampaignImages[0]!.id);
  });

  it('creates archive row without link for factions', () => {
    const ctx = minimalCtx();
    queuePortraitAsCampaignImage(
      ctx,
      'ambientazione/nazioni/stati.md',
      'faction',
      generateUuidV7(),
      'Stati Uniti',
      '![](/immagini/nazioni/stati.jpg)',
    );

    expect(ctx.portraitCampaignImages[0]?.links).toEqual([]);
    expect(ctx.portraitBindings[0]?.entityKind).toBe('faction');
  });
});

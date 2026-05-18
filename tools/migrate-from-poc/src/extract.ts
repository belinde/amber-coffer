import { registerEntityAliases } from './entity-aliases.js';
import { loadMapping, saveMapping } from './id-mapping.js';
import { extractCharacters } from './mapping/characters.js';
import { extractFactions } from './mapping/factions.js';
import { extractLocations } from './mapping/locations.js';
import { extractLoreNotes } from './mapping/lore-notes.js';
import { extractNarrativeSeeds } from './mapping/narrative-seeds.js';
import { extractNpcs } from './mapping/npcs.js';
import { extractSessions, preregisterSessions } from './mapping/sessions.js';
import { EntityRegistry } from './registry.js';
import type { CampaignDump, ExtractContext } from './types.js';

export const DUMP_VERSION = 1;

export type ExtractInput = {
  rootPath: string;
  campaignId: string;
  strict: boolean;
};

export async function extractCampaign(input: ExtractInput): Promise<CampaignDump> {
  const mapping = await loadMapping(input.rootPath, input.campaignId);
  const registry = new EntityRegistry();

  const ctx: ExtractContext = {
    rootPath: input.rootPath,
    campaignId: input.campaignId,
    strict: input.strict,
    warnings: [],
    errors: [],
    registry,
    mapping,
    assets: [],
    fileCount: 0,
  };

  await preregisterSessions(ctx);

  const locations = await extractLocations(ctx);
  const factions = await extractFactions(ctx);
  const characters = await extractCharacters(ctx);
  const npcs = await extractNpcs(ctx);
  const loreNotes = await extractLoreNotes(ctx);
  const narrativeSeeds = await extractNarrativeSeeds(ctx);
  registerEntityAliases(registry);
  const { sessions, campaignImages } = await extractSessions(ctx);

  await saveMapping(input.rootPath, ctx.mapping);

  const dump: CampaignDump = {
    version: DUMP_VERSION,
    sourceMeta: {
      rootPath: input.rootPath,
      extractedAt: Date.now(),
      files: ctx.fileCount,
    },
    campaignId: input.campaignId,
    entities: {
      characters,
      npcs,
      locations,
      factions,
      loreNotes,
      narrativeSeeds,
      sessions,
      campaignImages,
    },
    assets: ctx.assets,
    warnings: ctx.warnings,
    errors: ctx.errors,
  };

  if (input.strict && ctx.errors.length > 0) {
    throw new Error(`Extraction failed with ${ctx.errors.length} error(s) in strict mode`);
  }

  return dump;
}

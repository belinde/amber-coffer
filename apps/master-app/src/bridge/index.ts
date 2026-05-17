import type { CampaignId } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';

export {
  createCampaign,
  getCampaign,
  listCampaigns,
  type CreateCampaignInput,
} from './campaigns.js';
export {
  characterStatusSchema,
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  updateCharacter,
  type CreateCharacterInput,
  type UpdateCharacterInput,
} from './characters.js';

/**
 * Typed wrappers around Tauri invoke commands.
 * Business logic lives in Rust; this module is the sole IPC boundary from the renderer.
 */

export { importCampaignDump, type ImportCampaignReport } from './migrate.js';

export async function ping(): Promise<string> {
  return invoke<string>('ping');
}

/** @deprecated Use {@link listCampaigns} from `./campaigns.js` */
export async function listCampaignsLegacy(): Promise<unknown[]> {
  return invoke<unknown[]>('list_campaigns');
}

/** @deprecated Use {@link getCampaign} from `./campaigns.js` */
export async function getCampaignLegacy(_id: CampaignId): Promise<unknown> {
  return invoke<unknown>('get_campaign', { id: _id });
}

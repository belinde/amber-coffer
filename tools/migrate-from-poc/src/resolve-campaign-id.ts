import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { POC_CAMPAIGN_NAME } from '@amber/shared';

const APP_IDENTIFIER = 'click.belinde.ambercoffer';

type CampaignJson = {
  id?: string;
  name?: string;
};

function worldsRoots(): string[] {
  const home = homedir();
  return [
    join(home, '.local', 'share', APP_IDENTIFIER, 'worlds'),
    join(home, '.config', APP_IDENTIFIER, 'worlds'),
  ];
}

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function readCampaignJson(path: string): Promise<CampaignJson | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as CampaignJson;
  } catch {
    return null;
  }
}

/**
 * Resolves a campaign id from master-app storage by display name (read-only).
 * Does not create campaigns — use `ensure_poc_campaign` in Tauri for that.
 */
export async function resolveCampaignIdByName(
  campaignName: string = POC_CAMPAIGN_NAME,
): Promise<string | undefined> {
  const matches: string[] = [];

  for (const root of worldsRoots()) {
    if (!existsSync(root)) continue;

    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const jsonPath = join(root, entry.name, 'campaign.json');
      if (!existsSync(jsonPath)) continue;

      const campaign = await readCampaignJson(jsonPath);
      if (campaign?.id && campaign.name && namesMatch(campaign.name, campaignName)) {
        matches.push(campaign.id);
      }
    }
  }

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `Found ${matches.length} campaigns named "${campaignName}"; rename duplicates before extract`,
    );
  }
  return undefined;
}

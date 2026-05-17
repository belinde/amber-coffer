import { invoke } from '@tauri-apps/api/core';

export type ImportCampaignReport = {
  imported: number;
  updated: number;
  skipped: number;
  imagesCopied: number;
  errors: string[];
};

export async function importCampaignDump(
  dumpPath: string,
  campaignId: string,
): Promise<ImportCampaignReport> {
  return invoke<ImportCampaignReport>('import_campaign_dump', {
    dumpPath,
    campaignId,
  });
}

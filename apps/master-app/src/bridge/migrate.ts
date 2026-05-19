import { POC_CAMPAIGN_NAME } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';

export type ImportCampaignReport = {
  campaignId: string;
  campaignCreated: boolean;
  imported: number;
  updated: number;
  skipped: number;
  imagesCopied: number;
  portraitsSynced: number;
  portraitsRepaired: number;
  errors: string[];
};

export type RepairCampaignPortraitsReport = {
  campaignId: string;
  migratedToArchive: number;
  syncedFromLinks: number;
  syncedFromBindings: number;
  errors: string[];
};

export async function repairCampaignImagePortraits(
  campaignId: string,
): Promise<RepairCampaignPortraitsReport> {
  return invoke<RepairCampaignPortraitsReport>('repair_campaign_image_portraits', {
    campaignId,
  });
}

export type EnsurePocCampaignResult = {
  campaignId: string;
  created: boolean;
};

export async function ensurePocCampaign(): Promise<EnsurePocCampaignResult> {
  return invoke<EnsurePocCampaignResult>('ensure_poc_campaign');
}

export type ImportCampaignDumpInput = {
  dumpPath: string;
  campaignId?: string;
  /** Defaults to {@link POC_CAMPAIGN_NAME} when `campaignId` is omitted. */
  campaignName?: string;
};

export async function importCampaignDump(
  input: ImportCampaignDumpInput,
): Promise<ImportCampaignReport> {
  return invoke<ImportCampaignReport>('import_campaign_dump', {
    dumpPath: input.dumpPath,
    campaignId: input.campaignId ?? null,
    campaignName: input.campaignName ?? (input.campaignId ? null : POC_CAMPAIGN_NAME),
  });
}

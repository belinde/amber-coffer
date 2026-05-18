import type { Icon } from '@phosphor-icons/react';
import { DiscordLogo, SlidersHorizontal } from '@phosphor-icons/react';

export const CAMPAIGN_TABS = [
  { id: 'general', labelKey: 'campaign.tabs.general', icon: SlidersHorizontal },
  { id: 'discord', labelKey: 'campaign.tabs.discord', icon: DiscordLogo },
] as const;

export type CampaignTabId = (typeof CAMPAIGN_TABS)[number]['id'];

export function iconForCampaignTab(tabId: CampaignTabId): Icon {
  const tab = CAMPAIGN_TABS.find((entry) => entry.id === tabId);
  return tab?.icon ?? SlidersHorizontal;
}

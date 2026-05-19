import type { Icon } from '@phosphor-icons/react';
import { DiscordLogo } from '@phosphor-icons/react';

export const SETTINGS_TABS = [
  { id: 'discord', labelKey: 'settings.tabs.discord', icon: DiscordLogo },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

export function iconForSettingsTab(tabId: SettingsTabId): Icon {
  const tab = SETTINGS_TABS.find((entry) => entry.id === tabId);
  return tab?.icon ?? DiscordLogo;
}

import type { Icon } from '@phosphor-icons/react';

import {
  CampaignVaultIcon,
  ConnectionsIcon,
  iconForVaultCategory,
  ImagesIcon,
  SessionsIcon,
} from '../../components/ui/icons.js';

import type { VaultView } from './useVaultNavigation.js';
import { VAULT_CATEGORIES, type VaultCategory } from './vault-categories.js';

export type VaultNavTarget =
  | { kind: 'campaign' }
  | { kind: 'category'; category: VaultCategory }
  | { kind: 'images' }
  | { kind: 'sessions' }
  | { kind: 'connections' };

export type VaultNavItem = {
  id: string;
  target: VaultNavTarget;
  icon: Icon;
  labelKey:
    | 'vault.campaignTitle'
    | `vault.categories.${VaultCategory}`
    | 'vault.imagesTitle'
    | 'vault.sessionsTitle'
    | 'vault.connectionsTitle';
};

export function vaultViewForTarget(target: VaultNavTarget): VaultView {
  return target;
}

export function isVaultNavItemActive(item: VaultNavItem, current: VaultView): boolean {
  if (item.target.kind === 'category') {
    return (
      (current.kind === 'category' && current.category === item.target.category) ||
      (current.kind === 'detail' && current.category === item.target.category)
    );
  }
  return current.kind === item.target.kind;
}

export const VAULT_SIDEBAR_NAV_ITEMS: VaultNavItem[] = [
  {
    id: 'campaign',
    target: { kind: 'campaign' },
    icon: CampaignVaultIcon,
    labelKey: 'vault.campaignTitle',
  },
  ...VAULT_CATEGORIES.map((category) => ({
    id: category,
    target: { kind: 'category' as const, category },
    icon: iconForVaultCategory(category),
    labelKey: `vault.categories.${category}` as const,
  })),
  {
    id: 'images',
    target: { kind: 'images' },
    icon: ImagesIcon,
    labelKey: 'vault.imagesTitle',
  },
  {
    id: 'sessions',
    target: { kind: 'sessions' },
    icon: SessionsIcon,
    labelKey: 'vault.sessionsTitle',
  },
  {
    id: 'connections',
    target: { kind: 'connections' },
    icon: ConnectionsIcon,
    labelKey: 'vault.connectionsTitle',
  },
];

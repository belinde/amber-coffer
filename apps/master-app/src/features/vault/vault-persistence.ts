import type { VaultView } from './useVaultNavigation.js';

const ONBOARDING_CATALOG_KEY = 'amber.onboarding.vaultCatalogShown';
const lastViewKey = (campaignId: string) => `amber.vault.lastView.${campaignId}`;

const VAULT_VIEW_KINDS: VaultView['kind'][] = [
  'home',
  'campaign',
  'images',
  'connections',
  'sessions',
  'sessionDetail',
  'category',
  'detail',
];

function isVaultViewKind(kind: string): kind is VaultView['kind'] {
  return (VAULT_VIEW_KINDS as readonly string[]).includes(kind);
}

function isVaultView(value: unknown): value is VaultView {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    return false;
  }
  const kind = value.kind;
  return typeof kind === 'string' && isVaultViewKind(kind);
}

export function isVaultCatalogOnboardingDone(): boolean {
  return localStorage.getItem(ONBOARDING_CATALOG_KEY) === 'true';
}

export function markVaultCatalogOnboardingDone(): void {
  localStorage.setItem(ONBOARDING_CATALOG_KEY, 'true');
}

export function loadPersistedVaultView(campaignId: string): VaultView | null {
  const raw = localStorage.getItem(lastViewKey(campaignId));
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isVaultView(parsed) || parsed.kind === 'home') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function persistVaultView(campaignId: string, view: VaultView): void {
  if (view.kind === 'home') {
    return;
  }
  localStorage.setItem(lastViewKey(campaignId), JSON.stringify(view));
}

export function resolveInitialVaultView(
  campaignId: string,
  showCatalogFallback: boolean,
): VaultView {
  if (showCatalogFallback) {
    return { kind: 'home' };
  }
  return loadPersistedVaultView(campaignId) ?? { kind: 'sessions' };
}

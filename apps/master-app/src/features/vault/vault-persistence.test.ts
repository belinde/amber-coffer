import { describe, expect, it, beforeEach, vi } from 'vitest';

import {
  isVaultCatalogOnboardingDone,
  loadPersistedVaultView,
  markVaultCatalogOnboardingDone,
  persistVaultView,
  resolveInitialVaultView,
} from './vault-persistence.js';

function mockLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
}

describe('vault-persistence', () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  it('marks and reads catalog onboarding', () => {
    expect(isVaultCatalogOnboardingDone()).toBe(false);
    markVaultCatalogOnboardingDone();
    expect(isVaultCatalogOnboardingDone()).toBe(true);
  });

  it('uses catalog home only when fallback flag is set', () => {
    expect(resolveInitialVaultView('camp-1', true)).toEqual({ kind: 'home' });
    expect(resolveInitialVaultView('camp-1', false)).toEqual({ kind: 'sessions' });
  });

  it('persists and restores non-home views per campaign', () => {
    persistVaultView('camp-1', { kind: 'category', category: 'npcs' });
    expect(loadPersistedVaultView('camp-1')).toEqual({ kind: 'category', category: 'npcs' });
    expect(resolveInitialVaultView('camp-1', false)).toEqual({
      kind: 'category',
      category: 'npcs',
    });
  });

  it('does not persist catalog home', () => {
    persistVaultView('camp-1', { kind: 'home' });
    expect(loadPersistedVaultView('camp-1')).toBeNull();
  });
});

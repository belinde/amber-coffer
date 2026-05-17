import { createContext, useContext, type ReactElement, type ReactNode } from 'react';

import { useVaultNavigation, type VaultView } from './useVaultNavigation.js';

type VaultNavigationValue = {
  current: VaultView;
  pushView: (view: VaultView) => void;
  popView: () => void;
  resetToHome: () => void;
  goTo: (view: VaultView) => void;
};

const VaultNavigationContext = createContext<VaultNavigationValue | null>(null);

type ProviderProps = {
  children: ReactNode;
};

export function VaultNavigationProvider({ children }: ProviderProps): ReactElement {
  const value = useVaultNavigation();
  return <VaultNavigationContext.Provider value={value}>{children}</VaultNavigationContext.Provider>;
}

export function useVaultNavigationContext(): VaultNavigationValue {
  const value = useContext(VaultNavigationContext);
  if (value === null) {
    throw new Error('useVaultNavigationContext must be used within VaultNavigationProvider');
  }
  return value;
}

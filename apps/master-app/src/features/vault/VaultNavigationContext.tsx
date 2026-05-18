import type { Campaign } from '@amber/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  type ReactElement,
  type ReactNode,
} from 'react';

import { useAppError } from '../../context/AppErrorContext.js';

import { useVaultNavigation, type VaultView } from './useVaultNavigation.js';
import { persistVaultView } from './vault-persistence.js';

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
  campaignId: Campaign['id'];
  initialView: VaultView;
};

export function VaultNavigationProvider({
  children,
  campaignId,
  initialView,
}: ProviderProps): ReactElement {
  const { clearError } = useAppError();
  const {
    current,
    pushView: navPush,
    popView: navPop,
    resetToHome: navReset,
    goTo: navGo,
  } = useVaultNavigation(initialView);

  useEffect(() => {
    persistVaultView(campaignId, current);
  }, [campaignId, current]);

  const pushView = useCallback(
    (view: VaultView) => {
      clearError();
      navPush(view);
    },
    [clearError, navPush],
  );

  const popView = useCallback(() => {
    clearError();
    navPop();
  }, [clearError, navPop]);

  const resetToHome = useCallback(() => {
    clearError();
    navReset();
  }, [clearError, navReset]);

  const goTo = useCallback(
    (view: VaultView) => {
      clearError();
      navGo(view);
    },
    [clearError, navGo],
  );

  const value: VaultNavigationValue = {
    current,
    pushView,
    popView,
    resetToHome,
    goTo,
  };

  return (
    <VaultNavigationContext.Provider value={value}>{children}</VaultNavigationContext.Provider>
  );
}

export function useVaultNavigationContext(): VaultNavigationValue {
  const value = useContext(VaultNavigationContext);
  if (value === null) {
    throw new Error('useVaultNavigationContext must be used within VaultNavigationProvider');
  }
  return value;
}

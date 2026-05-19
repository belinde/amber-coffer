import { useCallback, useMemo, useState } from 'react';

import type { VaultCategory } from './vault-categories.js';

export type VaultView =
  | { kind: 'home' }
  | { kind: 'campaign' }
  | { kind: 'images' }
  | { kind: 'connections' }
  | { kind: 'sessions' }
  | { kind: 'sessionDetail'; sessionId: string }
  | { kind: 'category'; category: VaultCategory }
  | { kind: 'detail'; category: VaultCategory; entityId: string };

export function useVaultNavigation(initial: VaultView = { kind: 'sessions' }) {
  const [stack, setStack] = useState<VaultView[]>([initial]);

  const current = useMemo((): VaultView => stack[stack.length - 1] ?? { kind: 'home' }, [stack]);

  const pushView = useCallback((view: VaultView) => {
    setStack((prev) => [...prev, view]);
  }, []);

  const popView = useCallback(() => {
    setStack((prev) => {
      if (prev.length > 1) return prev.slice(0, -1);
      const top = prev[0];
      if (top && top.kind !== 'home') return [{ kind: 'home' }];
      return prev;
    });
  }, []);

  const resetToHome = useCallback(() => {
    setStack([{ kind: 'home' }]);
  }, []);

  const goTo = useCallback((view: VaultView) => {
    setStack([view]);
  }, []);

  return useMemo(
    () => ({ current, pushView, popView, resetToHome, goTo }),
    [current, pushView, popView, resetToHome, goTo],
  );
}

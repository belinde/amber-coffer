import { useCallback, useState } from 'react';

import type { VaultCategory } from './vault-categories.js';

export type VaultView =
  | { kind: 'home' }
  | { kind: 'images' }
  | { kind: 'connections' }
  | { kind: 'sessions' }
  | { kind: 'sessionDetail'; sessionId: string }
  | { kind: 'category'; category: VaultCategory }
  | { kind: 'detail'; category: VaultCategory; entityId: string };

export function useVaultNavigation(initial: VaultView = { kind: 'home' }) {
  const [stack, setStack] = useState<VaultView[]>([initial]);

  const current = stack[stack.length - 1] ?? { kind: 'home' };

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

  return { current, pushView, popView, resetToHome, goTo };
}

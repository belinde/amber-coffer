import type { Campaign, Session } from '@amber/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { listSessions } from '../bridge/sessions.js';

type ActiveSessionValue = {
  activeSession: Session | null;
  refreshActiveSession: () => Promise<void>;
  setActiveSessionFromRow: (session: Session | null) => void;
};

const ActiveSessionContext = createContext<ActiveSessionValue | null>(null);

type ProviderProps = {
  campaignId: Campaign['id'];
  children: ReactNode;
};

export function ActiveSessionProvider({ campaignId, children }: ProviderProps): ReactElement {
  const [activeSession, setActiveSession] = useState<Session | null>(null);

  const refreshActiveSession = useCallback(async () => {
    try {
      const rows = await listSessions(campaignId);
      setActiveSession(rows.find((s) => s.playState === 'live') ?? null);
    } catch {
      setActiveSession(null);
    }
  }, [campaignId]);

  useEffect(() => {
    void refreshActiveSession();
  }, [refreshActiveSession]);

  const value = useMemo(
    () => ({
      activeSession,
      refreshActiveSession,
      setActiveSessionFromRow: setActiveSession,
    }),
    [activeSession, refreshActiveSession],
  );

  return <ActiveSessionContext.Provider value={value}>{children}</ActiveSessionContext.Provider>;
}

export function useActiveSession(): ActiveSessionValue {
  const value = useContext(ActiveSessionContext);
  if (value === null) {
    throw new Error('useActiveSession must be used within ActiveSessionProvider');
  }
  return value;
}

export function useOptionalActiveSession(): ActiveSessionValue | null {
  return useContext(ActiveSessionContext);
}

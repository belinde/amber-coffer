import type { Map, Session } from '@amber/shared';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

type TabletopLiveValue = {
  sessionId: Session['id'] | null;
  activeMapId: Map['id'] | null;
  setTabletopLive: (sessionId: Session['id'] | null, activeMapId: Map['id'] | null) => void;
};

const TabletopLiveContext = createContext<TabletopLiveValue | null>(null);

type ProviderProps = {
  children: ReactNode;
};

export function TabletopLiveProvider({ children }: ProviderProps): ReactElement {
  const [sessionId, setSessionId] = useState<Session['id'] | null>(null);
  const [activeMapId, setActiveMapId] = useState<Map['id'] | null>(null);

  const setTabletopLive = useCallback(
    (nextSessionId: Session['id'] | null, nextMapId: Map['id'] | null) => {
      setSessionId(nextSessionId);
      setActiveMapId(nextMapId);
    },
    [],
  );

  const value = useMemo(
    () => ({ sessionId, activeMapId, setTabletopLive }),
    [sessionId, activeMapId, setTabletopLive],
  );

  return <TabletopLiveContext.Provider value={value}>{children}</TabletopLiveContext.Provider>;
}

export function useTabletopLive(): TabletopLiveValue | null {
  return useContext(TabletopLiveContext);
}

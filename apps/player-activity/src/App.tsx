import { lazy, Suspense, type ReactElement } from 'react';

import { DiscordProvider } from './app/DiscordContext.js';
import { PlayerActivityShell } from './app/PlayerActivityShell.js';
import { SessionHeader } from './app/SessionHeader.js';
import { SessionSyncProvider, useSessionSync } from './app/SessionSyncContext.js';

const DevControlPanel = import.meta.env.DEV
  ? lazy(async () => {
      const mod = await import('./dev/DevControlPanel.js');
      return { default: mod.DevControlPanel };
    })
  : null;

function AppContent(): ReactElement {
  const { sessionStatus, campaignName } = useSessionSync();

  const layoutClass =
    sessionStatus === 'connected'
      ? 'player-activity-layout player-activity-layout--connected'
      : 'player-activity-layout';

  return (
    <div className={layoutClass}>
      <SessionHeader status={sessionStatus} campaignName={campaignName} />
      {DevControlPanel ? (
        <Suspense fallback={null}>
          <DevControlPanel />
        </Suspense>
      ) : null}
      <PlayerActivityShell />
    </div>
  );
}

function App(): ReactElement {
  return (
    <DiscordProvider>
      <SessionSyncProvider>
        <AppContent />
      </SessionSyncProvider>
    </DiscordProvider>
  );
}

export default App;

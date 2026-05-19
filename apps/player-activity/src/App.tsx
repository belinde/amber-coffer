import { lazy, Suspense, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { DiscordProvider } from './app/DiscordContext.js';
import { PlayerActivityShell } from './app/PlayerActivityShell.js';
import { SessionSyncProvider } from './app/SessionSyncContext.js';

const DevControlPanel = import.meta.env.DEV
  ? lazy(async () => {
      const mod = await import('./dev/DevControlPanel.js');
      return { default: mod.DevControlPanel };
    })
  : null;

function App(): ReactElement {
  const { t } = useTranslation();

  return (
    <DiscordProvider>
      <SessionSyncProvider>
        <div className="player-activity-layout">
          <header className="player-activity-layout__header">
            <h1>{t('app.title')}</h1>
            <p>{t('app.subtitle')}</p>
          </header>
          {DevControlPanel ? (
            <Suspense fallback={null}>
              <DevControlPanel />
            </Suspense>
          ) : null}
          <PlayerActivityShell />
        </div>
      </SessionSyncProvider>
    </DiscordProvider>
  );
}

export default App;

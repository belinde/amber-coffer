import type { Campaign } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listCampaigns } from './bridge/campaigns.js';
import { Button } from './components/ui/Button.js';
import { ActionIcons } from './components/ui/icons.js';
import { CampaignBar } from './features/campaigns/CampaignBar.js';
import { VaultNavigationProvider } from './features/vault/VaultNavigationContext.js';
import { VaultShell } from './features/vault/VaultShell.js';
import { VaultSidebarNav } from './features/vault/VaultSidebarNav.js';

type CampaignId = Campaign['id'];

function App(): ReactElement {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<CampaignId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    try {
      const rows = await listCampaigns();
      setCampaigns(rows);
      setSelectedCampaignId((prev) => prev ?? rows[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId) ?? null;

  const shell = (
    <div className="app-shell">
      <aside className="app-sidebar">
        <h1>{t('app.title')}</h1>
        <p className="subtitle">{t('app.subtitle')}</p>

        <CampaignBar
          campaigns={campaigns}
          selectedId={selectedCampaignId}
          onSelect={setSelectedCampaignId}
          onCreated={(campaign) => {
            setCampaigns((prev) => [...prev, campaign].sort((a, b) => a.name.localeCompare(b.name)));
            setSelectedCampaignId(campaign.id);
          }}
          onError={setError}
        />

        {selectedCampaign ? (
          <>
            <hr className="app-sidebar__divider" />
            <VaultSidebarNav />
          </>
        ) : null}
      </aside>

      <main className="app-main">
        {error ? (
          <div className="error-banner" role="alert">
            {error}
            <Button
              type="button"
              icon={ActionIcons.dismiss}
              onClick={() => setError(null)}
              style={{ marginLeft: '0.75rem' }}
            >
              {t('common.dismiss')}
            </Button>
          </div>
        ) : null}

        {selectedCampaign === null ? (
          <p className="empty-state">{t('campaign.selectHint')}</p>
        ) : (
          <VaultShell campaign={selectedCampaign} onError={setError} />
        )}
      </main>
    </div>
  );

  if (selectedCampaign === null) {
    return shell;
  }

  return <VaultNavigationProvider key={selectedCampaign.id}>{shell}</VaultNavigationProvider>;
}

export default App;

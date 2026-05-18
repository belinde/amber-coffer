import type { Campaign } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listCampaigns } from './bridge/campaigns.js';
import { ActiveSessionProvider } from './context/ActiveSessionContext.js';
import { AppErrorProvider, ErrorOutlet, useAppError } from './context/AppErrorContext.js';
import { SidebarCampaignSlot } from './features/campaigns/SidebarCampaignSlot.js';
import { SettingsSidebarLink } from './features/settings/SettingsSidebarLink.js';
import { SettingsView } from './features/settings/SettingsView.js';
import type { VaultView } from './features/vault/useVaultNavigation.js';
import {
  isVaultCatalogOnboardingDone,
  markVaultCatalogOnboardingDone,
  resolveInitialVaultView,
} from './features/vault/vault-persistence.js';
import { VaultNavigationProvider } from './features/vault/VaultNavigationContext.js';
import { VaultShell } from './features/vault/VaultShell.js';
import { VaultSidebarNav } from './features/vault/VaultSidebarNav.js';

type CampaignId = Campaign['id'];
type ShellSection = 'vault' | 'settings';

function AppShell(): ReactElement {
  const { t } = useTranslation();
  const { reportError, clearError } = useAppError();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<CampaignId | null>(null);
  const [shellSection, setShellSection] = useState<ShellSection>('vault');
  const [catalogFallbackCampaignId, setCatalogFallbackCampaignId] = useState<CampaignId | null>(
    null,
  );
  const [onboardingResolved, setOnboardingResolved] = useState(false);

  const loadCampaigns = useCallback(async () => {
    try {
      const rows = await listCampaigns();
      setCampaigns(rows);
      const firstId = rows[0]?.id ?? null;
      setSelectedCampaignId((prev) => prev ?? firstId);

      if (!isVaultCatalogOnboardingDone() && rows.length > 0) {
        markVaultCatalogOnboardingDone();
        setCatalogFallbackCampaignId(firstId);
      }
      setOnboardingResolved(true);
    } catch (err) {
      reportError(err instanceof Error ? err.message : String(err));
    }
  }, [reportError]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    setShellSection('vault');
  }, [selectedCampaignId]);

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId) ?? null;

  const handleCampaignUpdated = useCallback((updated: Campaign) => {
    setCampaigns((prev) =>
      [...prev.map((c) => (c.id === updated.id ? updated : c))].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
  }, []);

  const openVault = useCallback(() => {
    clearError();
    setShellSection('vault');
  }, [clearError]);

  const openSettings = useCallback(() => {
    clearError();
    setShellSection('settings');
  }, [clearError]);

  const shell = (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar__body">
          <h1>{t('app.title')}</h1>
          <p className="subtitle">{t('app.subtitle')}</p>

          <SidebarCampaignSlot
            campaigns={campaigns}
            selectedId={selectedCampaignId}
            onSelect={(id) => {
              clearError();
              setSelectedCampaignId(id);
            }}
            onCreated={(campaign) => {
              if (!isVaultCatalogOnboardingDone()) {
                markVaultCatalogOnboardingDone();
              }
              setCampaigns((prev) =>
                [...prev, campaign].sort((a, b) => a.name.localeCompare(b.name)),
              );
              setSelectedCampaignId(campaign.id);
            }}
            onOpenVault={openVault}
          />

          {selectedCampaign ? (
            <>
              <hr className="app-sidebar__divider" />
              <VaultSidebarNav vaultNavActive={shellSection === 'vault'} onNavigate={openVault} />
            </>
          ) : null}
        </div>

        <footer className="app-sidebar__footer">
          <hr className="app-sidebar__divider" />
          <SettingsSidebarLink active={shellSection === 'settings'} onOpen={() => openSettings()} />
        </footer>
      </aside>

      <main className="app-main">
        {selectedCampaign === null ? <ErrorOutlet region="main" /> : null}

        {shellSection === 'settings' ? (
          <SettingsView onError={reportError} />
        ) : selectedCampaign === null ? (
          <p className="empty-state">{t('campaign.selectHint')}</p>
        ) : (
          <VaultShell
            campaign={selectedCampaign}
            onError={reportError}
            onOpenSettings={openSettings}
            onCampaignUpdated={handleCampaignUpdated}
          />
        )}
      </main>
    </div>
  );

  if (selectedCampaign === null || !onboardingResolved) {
    return shell;
  }

  const initialVaultView: VaultView = resolveInitialVaultView(
    selectedCampaign.id,
    catalogFallbackCampaignId === selectedCampaign.id,
  );

  return (
    <VaultNavigationProvider
      key={selectedCampaign.id}
      campaignId={selectedCampaign.id}
      initialView={initialVaultView}
    >
      <ActiveSessionProvider campaignId={selectedCampaign.id}>{shell}</ActiveSessionProvider>
    </VaultNavigationProvider>
  );
}

function App(): ReactElement {
  return (
    <AppErrorProvider>
      <AppShell />
    </AppErrorProvider>
  );
}

export default App;

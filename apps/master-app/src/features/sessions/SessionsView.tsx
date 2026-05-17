import type { Campaign } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCampaign } from '../../bridge/campaigns.js';
import { SessionsIcon } from '../../components/ui/icons.js';
import { PanelPageHeader } from '../../components/ui/PanelPageHeader.js';
import { DiscordSettingsPanel } from '../live-session/DiscordSettingsPanel.js';

import { SessionsPanel } from './SessionsPanel.js';

type Props = {
  campaignId: Campaign['id'];
  onBack: () => void;
  onError: (message: string) => void;
  onOpenSession: (sessionId: string) => void;
};

export function SessionsView({ campaignId, onBack, onError, onOpenSession }: Props): ReactElement {
  const { t } = useTranslation();
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  const loadCampaign = useCallback(async () => {
    try {
      setCampaign(await getCampaign(campaignId));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }, [campaignId, onError]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  return (
    <div className="vault-sessions">
      <PanelPageHeader icon={SessionsIcon} title={t('vault.sessionsTitle')} onBack={onBack} />
      <p className="vault-section-help">{t('vault.sessionsHint')}</p>
      {campaign ? (
        <DiscordSettingsPanel
          campaign={campaign}
          onCampaignUpdated={setCampaign}
          onError={onError}
        />
      ) : null}
      <SessionsPanel campaignId={campaignId} onError={onError} onOpenSession={onOpenSession} />
    </div>
  );
}

import type { Campaign } from '@amber/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { SessionsIcon } from '../../components/ui/icons.js';
import { PanelPageHeader } from '../../components/ui/PanelPageHeader.js';

import { SessionsPanel } from './SessionsPanel.js';

type Props = {
  campaignId: Campaign['id'];
  onBack: () => void;
  onError: (message: string) => void;
  onOpenSession: (sessionId: string) => void;
};

export function SessionsView({ campaignId, onBack, onError, onOpenSession }: Props): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="vault-sessions">
      <PanelPageHeader icon={SessionsIcon} title={t('vault.sessionsTitle')} onBack={onBack} />
      <p className="vault-section-help">{t('vault.sessionsHint')}</p>
      <SessionsPanel campaignId={campaignId} onError={onError} onOpenSession={onOpenSession} />
    </div>
  );
}

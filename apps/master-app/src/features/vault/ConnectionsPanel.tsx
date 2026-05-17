import type { Campaign } from '@amber/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { ConnectionsIcon } from '../../components/ui/icons.js';
import { PanelPageHeader } from '../../components/ui/PanelPageHeader.js';
import { ItemsPanel } from '../items/ItemsPanel.js';
import { RelationshipsPanel } from '../relationships/RelationshipsPanel.js';

type Props = {
  campaignId: Campaign['id'];
  onBack: () => void;
  onError: (message: string) => void;
};

export function ConnectionsPanel({ campaignId, onBack, onError }: Props): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="vault-connections">
      <PanelPageHeader icon={ConnectionsIcon} title={t('vault.connectionsTitle')} onBack={onBack} />
      <p className="vault-section-help">{t('vault.connectionsHint')}</p>
      <ItemsPanel campaignId={campaignId} onError={onError} />
      <RelationshipsPanel campaignId={campaignId} onError={onError} />
    </div>
  );
}

import type { Campaign } from '@amber/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { ImagesIcon } from '../../components/ui/icons.js';
import { PanelPageHeader } from '../../components/ui/PanelPageHeader.js';

import { ImagesPanel } from './ImagesPanel.js';

type Props = {
  campaignId: Campaign['id'];
  onBack: () => void;
  onError: (message: string) => void;
};

export function ImagesView({ campaignId, onBack, onError }: Props): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="vault-images">
      <PanelPageHeader icon={ImagesIcon} title={t('vault.imagesTitle')} onBack={onBack} />
      <p className="vault-section-help">{t('vault.imagesHint')}</p>
      <ImagesPanel campaignId={campaignId} onError={onError} />
    </div>
  );
}

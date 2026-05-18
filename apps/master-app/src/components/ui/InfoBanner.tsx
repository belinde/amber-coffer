import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ActionIcons } from './icons.js';

type Props = {
  onDismiss: () => void;
  children: ReactNode;
  labelledBy?: string | undefined;
};

export function InfoBanner({ onDismiss, children, labelledBy }: Props): ReactElement {
  const { t } = useTranslation();

  return (
    <div
      className="info-banner"
      role="region"
      {...(labelledBy ? { 'aria-labelledby': labelledBy } : {})}
    >
      <button
        type="button"
        className="btn btn-icon-only info-banner__dismiss"
        onClick={onDismiss}
        aria-label={t('common.dismiss')}
      >
        <ActionIcons.dismiss size={18} weight="regular" aria-hidden />
      </button>
      <div className="info-banner__body">{children}</div>
    </div>
  );
}

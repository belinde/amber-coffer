import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { ActionIcons } from './icons.js';

type Props = {
  message: string;
  onDismiss: () => void;
  compact?: boolean;
};

export function ErrorBanner({ message, onDismiss, compact = false }: Props): ReactElement {
  const { t } = useTranslation();

  return (
    <div className={compact ? 'error-banner error-banner--compact' : 'error-banner'} role="alert">
      <p className="error-banner__message">{message}</p>
      <button
        type="button"
        className="btn btn-icon-only error-banner__dismiss"
        onClick={onDismiss}
        aria-label={t('common.dismiss')}
      >
        <ActionIcons.dismiss size={18} weight="regular" aria-hidden />
      </button>
    </div>
  );
}

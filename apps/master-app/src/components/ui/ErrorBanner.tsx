import { ErrorBanner as UiErrorBanner } from '@amber/ui';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  message: string;
  onDismiss: () => void;
  compact?: boolean;
};

export function ErrorBanner({ message, onDismiss, compact = false }: Props): ReactElement {
  const { t } = useTranslation();
  return (
    <UiErrorBanner
      message={message}
      onDismiss={onDismiss}
      compact={compact}
      dismissAriaLabel={t('common.dismiss')}
    />
  );
}

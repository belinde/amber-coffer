import { PanelPageHeader as UiPanelPageHeader } from '@amber/ui';
import type { Icon } from '@phosphor-icons/react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorOutlet } from '../../context/AppErrorContext.js';

type Props = {
  icon: Icon;
  title: string;
  subtitle?: string | undefined;
  onBack: () => void;
  actions?: ReactNode;
};

export function PanelPageHeader({ icon, title, subtitle, onBack, actions }: Props): ReactElement {
  const { t } = useTranslation();

  return (
    <UiPanelPageHeader
      icon={icon}
      title={title}
      subtitle={subtitle}
      backLabel={t('vault.back')}
      onBack={onBack}
      actions={actions}
      errorSlot={actions ? <ErrorOutlet region="main" /> : undefined}
    />
  );
}

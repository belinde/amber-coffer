import type { Icon } from '@phosphor-icons/react';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components/ui/Button.js';
import { ActionIcons } from '../../../components/ui/icons.js';
import { PanelPageHeader } from '../../../components/ui/PanelPageHeader.js';

type Props = {
  icon: Icon;
  title: string;
  subtitle?: string;
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
  onDelete?: (() => void) | undefined;
  children: ReactNode;
};

export function EntityDetailLayout({
  icon,
  title,
  subtitle,
  saving,
  onBack,
  onSave,
  onDelete,
  children,
}: Props): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="vault-detail">
      <PanelPageHeader
        icon={icon}
        title={title}
        {...(subtitle ? { subtitle } : {})}
        onBack={onBack}
        actions={
          <>
            {onDelete ? (
              <Button type="button" variant="danger" icon={ActionIcons.delete} onClick={onDelete}>
                {t('common.delete')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="primary"
              icon={ActionIcons.save}
              disabled={saving}
              onClick={onSave}
            >
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      />
      {children}
    </div>
  );
}

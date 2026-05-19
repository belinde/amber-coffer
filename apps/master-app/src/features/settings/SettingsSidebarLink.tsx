import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/Button.js';
import { SettingsIcon } from '../../components/ui/icons.js';

type Props = {
  active: boolean;
  onOpen: () => void;
};

export function SettingsSidebarLink({ active, onOpen }: Props): ReactElement {
  const { t } = useTranslation();

  return (
    <Button
      type="button"
      className={active ? 'sidebar-settings-link is-active' : 'sidebar-settings-link'}
      icon={SettingsIcon}
      aria-current={active ? 'page' : undefined}
      onClick={onOpen}
    >
      {t('settings.sidebarLink')}
    </Button>
  );
}

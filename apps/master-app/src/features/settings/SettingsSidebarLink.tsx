import { DiscordLogo } from '@phosphor-icons/react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/Button.js';

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
      icon={DiscordLogo}
      aria-current={active ? 'page' : undefined}
      onClick={onOpen}
    >
      {t('settings.sidebarLink')}
    </Button>
  );
}

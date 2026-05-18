import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/Button.js';
import { useActiveSession } from '../../context/ActiveSessionContext.js';
import { useVaultNavigationContext } from '../vault/VaultNavigationContext.js';

import { formatSessionLabel } from './session-label.js';

type Props = {
  onOpenVault: () => void;
};

export function ReturnToSessionSidebar({ onOpenVault }: Props): ReactElement | null {
  const { t } = useTranslation();
  const { activeSession } = useActiveSession();
  const { goTo } = useVaultNavigationContext();

  if (!activeSession) {
    return null;
  }

  return (
    <div className="sidebar-return-session-wrap">
      <Button
        type="button"
        variant="primary"
        className="sidebar-return-session"
        onClick={() => {
          onOpenVault();
          goTo({ kind: 'sessionDetail', sessionId: activeSession.id });
        }}
      >
        {t('sessionDetail.returnToSession', {
          label: formatSessionLabel(activeSession, t),
        })}
      </Button>
      <p className="sidebar-return-session__hint">{t('sessionDetail.campaignLockedHint')}</p>
    </div>
  );
}

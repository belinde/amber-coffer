import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/Button.js';

import {
  isVaultNavItemActive,
  VAULT_SIDEBAR_NAV_ITEMS,
  vaultViewForTarget,
} from './vault-nav-items.js';
import { useVaultNavigationContext } from './VaultNavigationContext.js';

export function VaultSidebarNav(): ReactElement {
  const { t } = useTranslation();
  const { current, goTo } = useVaultNavigationContext();

  return (
    <nav className="sidebar-vault-nav" aria-label={t('vault.sidebarNav')}>
      <ul className="sidebar-vault-nav__list">
        {VAULT_SIDEBAR_NAV_ITEMS.map((item) => {
          const active = isVaultNavItemActive(item, current);
          return (
            <li key={item.id}>
              <Button
                type="button"
                className={active ? 'sidebar-vault-nav__btn is-active' : 'sidebar-vault-nav__btn'}
                icon={item.icon}
                aria-current={active ? 'page' : undefined}
                onClick={() => goTo(vaultViewForTarget(item.target))}
              >
                {t(item.labelKey)}
              </Button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/ui/Button.js';
import {
  ConnectionsIcon,
  iconForVaultCategory,
  ImagesIcon,
  SessionsIcon,
} from '../../components/ui/icons.js';

const VAULT_CARD_BG_ICON_SIZE = 112;
const VAULT_CARD_BG_ICON_WEIGHT = 'duotone' as const;

import { VAULT_CATEGORIES, type VaultCategory } from './vault-categories.js';

type Props = {
  campaignName: string;
  onOpenCategory: (category: VaultCategory) => void;
  onOpenImages: () => void;
  onOpenConnections: () => void;
  onOpenSessions: () => void;
};

export function VaultHome({
  campaignName,
  onOpenCategory,
  onOpenImages,
  onOpenConnections,
  onOpenSessions,
}: Props): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="vault-home">
      <header className="panel-header">
        <h2>{t('vault.homeTitle')}</h2>
        <p className="vault-home-campaign">{campaignName}</p>
      </header>
      <p className="vault-section-help">{t('vault.homeHint')}</p>
      <ul className="vault-category-grid">
        {VAULT_CATEGORIES.map((category) => {
          const CategoryIcon = iconForVaultCategory(category);
          return (
            <li key={category}>
              <Button
                type="button"
                className="vault-category-card"
                onClick={() => onOpenCategory(category)}
              >
                <span className="vault-category-card__bg" aria-hidden>
                  <CategoryIcon size={VAULT_CARD_BG_ICON_SIZE} weight={VAULT_CARD_BG_ICON_WEIGHT} />
                </span>
                <span className="vault-category-card__content">
                  <strong>{t(`vault.categories.${category}`)}</strong>
                  <span className="vault-category-card__blurb">
                    {t(`vault.categoryBlurb.${category}`)}
                  </span>
                </span>
              </Button>
            </li>
          );
        })}
        <li>
          <Button
            type="button"
            className="vault-category-card"
            onClick={onOpenImages}
          >
            <span className="vault-category-card__bg" aria-hidden>
              <ImagesIcon size={VAULT_CARD_BG_ICON_SIZE} weight={VAULT_CARD_BG_ICON_WEIGHT} />
            </span>
            <span className="vault-category-card__content">
              <strong>{t('vault.imagesTitle')}</strong>
              <span className="vault-category-card__blurb">{t('vault.imagesBlurb')}</span>
            </span>
          </Button>
        </li>
        <li>
          <Button
            type="button"
            className="vault-category-card"
            onClick={onOpenSessions}
          >
            <span className="vault-category-card__bg" aria-hidden>
              <SessionsIcon size={VAULT_CARD_BG_ICON_SIZE} weight={VAULT_CARD_BG_ICON_WEIGHT} />
            </span>
            <span className="vault-category-card__content">
              <strong>{t('vault.sessionsTitle')}</strong>
              <span className="vault-category-card__blurb">{t('vault.sessionsBlurb')}</span>
            </span>
          </Button>
        </li>
        <li>
          <Button
            type="button"
            className="vault-category-card"
            onClick={onOpenConnections}
          >
            <span className="vault-category-card__bg" aria-hidden>
              <ConnectionsIcon size={VAULT_CARD_BG_ICON_SIZE} weight={VAULT_CARD_BG_ICON_WEIGHT} />
            </span>
            <span className="vault-category-card__content">
              <strong>{t('vault.connectionsTitle')}</strong>
              <span className="vault-category-card__blurb">{t('vault.connectionsBlurb')}</span>
            </span>
          </Button>
        </li>
      </ul>
    </div>
  );
}

import { DiscordLogo } from '@phosphor-icons/react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { BotTokenSetupPanel } from './BotTokenSetupPanel.js';
import { DiscordSetupInfoAside } from './DiscordSetupInfoAside.js';

type Props = {
  onError: (message: string) => void;
};

export function SettingsView({ onError }: Props): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="settings-view">
      <header className="panel-header">
        <div className="panel-title-row">
          <span className="settings-view__icon" aria-hidden>
            <DiscordLogo size={44} weight="duotone" />
          </span>
          <h2>{t('settings.title')}</h2>
        </div>
      </header>

      <section className="settings-discord-page" aria-labelledby="settings-discord-heading">
        <p id="settings-discord-heading" className="vault-section-help">
          {t('settings.discordPageHint')}
        </p>
        <div className="settings-discord-layout">
          <div className="settings-discord-layout__main discord-settings-stack">
            <BotTokenSetupPanel onError={onError} />
          </div>
          <DiscordSetupInfoAside />
        </div>
      </section>
    </div>
  );
}

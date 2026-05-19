import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SettingsIcon } from '../../components/ui/icons.js';

import { BotTokenSetupPanel } from './BotTokenSetupPanel.js';
import { DiscordSetupInfoAside } from './DiscordSetupInfoAside.js';
import { SETTINGS_TABS, iconForSettingsTab, type SettingsTabId } from './settings-tabs.config.js';

type Props = {
  onError: (message: string) => void;
};

export function SettingsView({ onError }: Props): ReactElement {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTabId>('discord');

  return (
    <div className="settings-view">
      <header className="panel-header">
        <div className="panel-title-row">
          <span className="settings-view__icon" aria-hidden>
            <SettingsIcon size={44} weight="duotone" />
          </span>
          <h2>{t('settings.title')}</h2>
        </div>
      </header>

      <nav className="vault-section-tabs" role="tablist" aria-label={t('settings.sectionNav')}>
        {SETTINGS_TABS.map((tab) => {
          const TabIcon = iconForSettingsTab(tab.id);
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={tab.id === 'discord' ? 'settings-discord-tab' : undefined}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={tab.id === 'discord' ? 'settings-discord-panel' : undefined}
              className={['vault-section-tab', isActive && 'vault-section-tab--active']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setActiveTab(tab.id)}
            >
              <TabIcon size={18} weight={isActive ? 'fill' : 'regular'} aria-hidden />
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      {activeTab === 'discord' ? (
        <section
          id="settings-discord-panel"
          className="settings-discord-page"
          role="tabpanel"
          aria-labelledby="settings-discord-tab"
        >
          <p className="vault-section-help">{t('settings.discordPageHint')}</p>
          <div className="settings-discord-layout">
            <div className="settings-discord-layout__main discord-settings-stack">
              <BotTokenSetupPanel onError={onError} />
            </div>
            <DiscordSetupInfoAside />
          </div>
        </section>
      ) : null}
    </div>
  );
}

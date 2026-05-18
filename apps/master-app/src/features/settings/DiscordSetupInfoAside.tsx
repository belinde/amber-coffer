import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

const PORTAL_STEPS = [
  'settings.discord.infoAside.step1',
  'settings.discord.infoAside.step2',
  'settings.discord.infoAside.step3',
  'settings.discord.infoAside.step4',
  'settings.discord.infoAside.step5',
] as const;

export function DiscordSetupInfoAside(): ReactElement {
  const { t } = useTranslation();

  return (
    <aside className="discord-settings-info" aria-labelledby="discord-setup-info-heading">
      <h3 id="discord-setup-info-heading" className="discord-settings-info__title">
        {t('settings.discord.infoAside.title')}
      </h3>

      <section className="discord-settings-info__block">
        <h4 className="discord-settings-info__heading">
          {t('settings.discord.infoAside.identityTitle')}
        </h4>
        <p className="discord-settings-info__text">
          {t('settings.discord.infoAside.identityBody')}
        </p>
      </section>

      <section className="discord-settings-info__block">
        <h4 className="discord-settings-info__heading">
          {t('settings.discord.infoAside.whyTitle')}
        </h4>
        <p className="discord-settings-info__text">{t('settings.discord.infoAside.whyBody')}</p>
      </section>

      <section className="discord-settings-info__block">
        <h4 className="discord-settings-info__heading">
          {t('settings.discord.infoAside.howTitle')}
        </h4>
        <ol className="discord-settings-info__steps">
          {PORTAL_STEPS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ol>
        <p className="discord-settings-info__text discord-settings-info__text--spaced">
          {t('settings.discord.infoAside.wizardNote')}
        </p>
      </section>
    </aside>
  );
}

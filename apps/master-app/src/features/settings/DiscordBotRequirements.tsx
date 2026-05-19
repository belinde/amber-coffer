import {
  GM_BOT_DISABLED_INTENT_IDS,
  GM_BOT_INVITE_PERMISSION_IDS,
  GM_BOT_PRIVILEGED_INTENT_IDS,
} from '@amber/shared';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  className?: string;
  headingLevel?: 'h4' | 'h5';
};

export function DiscordBotRequirements({
  className,
  headingLevel: HeadingTag = 'h4',
}: Props): ReactElement {
  const { t } = useTranslation();
  const base = 'settings.discord.requirements';

  return (
    <div className={['discord-bot-requirements', className].filter(Boolean).join(' ')}>
      <HeadingTag className="discord-bot-requirements__title">{t(`${base}.title`)}</HeadingTag>

      <section className="discord-bot-requirements__section">
        <h5 className="discord-bot-requirements__heading">{t(`${base}.intentsHeading`)}</h5>
        <p className="discord-bot-requirements__intro">{t(`${base}.intentsIntro`)}</p>
        <ul className="discord-bot-requirements__list discord-bot-requirements__list--required">
          {GM_BOT_PRIVILEGED_INTENT_IDS.map((id) => (
            <li key={id}>{t(`${base}.intent.${id}`)}</li>
          ))}
        </ul>
      </section>

      <section className="discord-bot-requirements__section">
        <h5 className="discord-bot-requirements__heading">{t(`${base}.permissionsHeading`)}</h5>
        <p className="discord-bot-requirements__intro">{t(`${base}.permissionsIntro`)}</p>
        <ul className="discord-bot-requirements__list discord-bot-requirements__list--required">
          {GM_BOT_INVITE_PERMISSION_IDS.map((id) => (
            <li key={id}>{t(`${base}.permission.${id}`)}</li>
          ))}
        </ul>
      </section>

      <section className="discord-bot-requirements__section">
        <h5 className="discord-bot-requirements__heading">{t(`${base}.notRequiredHeading`)}</h5>
        <ul className="discord-bot-requirements__list discord-bot-requirements__list--optional">
          {GM_BOT_DISABLED_INTENT_IDS.map((id) => (
            <li key={id}>{t(`${base}.notRequired.${id}`)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

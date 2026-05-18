import { openUrl } from '@tauri-apps/plugin-opener';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { discordParseBotApplicationId } from '../../bridge/discord-setup.js';
import { hasDiscordBotToken, setDiscordBotToken } from '../../bridge/session-pipeline.js';
import { Button } from '../../components/ui/Button.js';
import { Field } from '../../components/ui/Field.js';
import { ActionIcons } from '../../components/ui/icons.js';

const DEVELOPER_PORTAL_URL = 'https://discord.com/developers/applications';

type Props = {
  onError: (message: string) => void;
  onTokenConfigured?: () => void;
};

export function BotTokenSetupPanel({ onError, onTokenConfigured }: Props): ReactElement {
  const { t } = useTranslation();
  const [botToken, setBotToken] = useState('');
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [parsedAppId, setParsedAppId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refreshTokenState = useCallback(async () => {
    try {
      setTokenConfigured(await hasDiscordBotToken());
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }, [onError]);

  useEffect(() => {
    void refreshTokenState();
  }, [refreshTokenState]);

  useEffect(() => {
    const trimmed = botToken.trim();
    if (!trimmed) {
      setParsedAppId(null);
      return;
    }
    void discordParseBotApplicationId(trimmed)
      .then(setParsedAppId)
      .catch(() => setParsedAppId(null));
  }, [botToken]);

  async function openDeveloperPortal(): Promise<void> {
    try {
      await openUrl(DEVELOPER_PORTAL_URL);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveToken(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    if (!botToken.trim()) return;
    setSaving(true);
    try {
      await setDiscordBotToken(botToken.trim());
      setBotToken('');
      await refreshTokenState();
      onTokenConfigured?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="discord-settings discord-settings--bot-token"
      aria-labelledby="bot-token-heading"
    >
      <h3 id="bot-token-heading">{t('settings.discord.botSetup.title')}</h3>
      <p className="vault-section-help">{t('settings.discord.botSetup.hint')}</p>

      <ol className="discord-wizard-steps">
        <li>
          <Button type="button" variant="default" onClick={() => void openDeveloperPortal()}>
            {t('settings.discord.botSetup.openPortal')}
          </Button>
          <p className="vault-section-help">{t('settings.discord.botSetup.stepCreate')}</p>
        </li>
        <li>
          <p className="vault-section-help">{t('settings.discord.botSetup.stepBotToken')}</p>
        </li>
        <li>
          <p className="vault-section-help">{t('settings.discord.botSetup.stepIntents')}</p>
        </li>
      </ol>

      <form onSubmit={(ev) => void saveToken(ev)}>
        <Field label={t('liveSession.botToken')} htmlFor="settings-discord-bot-token">
          <div className="discord-settings__control-row">
            <input
              id="settings-discord-bot-token"
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder={
                tokenConfigured
                  ? t('liveSession.botTokenReplacePlaceholder')
                  : t('liveSession.botTokenPlaceholder')
              }
              autoComplete="off"
            />
            <Button
              type="submit"
              variant="primary"
              className="discord-settings__save-btn"
              icon={ActionIcons.save}
              disabled={saving || !botToken.trim()}
            >
              {saving ? t('common.saving') : t('liveSession.saveBotToken')}
            </Button>
          </div>
        </Field>
        {parsedAppId ? (
          <p className="vault-section-help" role="status">
            {t('settings.discord.botSetup.applicationId', { id: parsedAppId })}
          </p>
        ) : null}
        <p className="vault-section-help discord-settings__token-status" role="status">
          {tokenConfigured ? t('liveSession.botTokenConfigured') : t('liveSession.botTokenMissing')}
        </p>
      </form>
    </section>
  );
}

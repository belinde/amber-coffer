import type { Campaign } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { updateCampaign } from '../../bridge/campaigns.js';
import { hasDiscordBotToken, setDiscordBotToken } from '../../bridge/session-pipeline.js';
import { Button } from '../../components/ui/Button.js';
import { Field } from '../../components/ui/Field.js';
import { ActionIcons } from '../../components/ui/icons.js';

type Props = {
  campaign: Campaign;
  onCampaignUpdated: (campaign: Campaign) => void;
  onError: (message: string) => void;
};

export function DiscordSettingsPanel({
  campaign,
  onCampaignUpdated,
  onError,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [channelId, setChannelId] = useState(campaign.discordChannelId ?? '');
  const [botToken, setBotToken] = useState('');
  const [tokenConfigured, setTokenConfigured] = useState(false);
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
    setChannelId(campaign.discordChannelId ?? '');
  }, [campaign.discordChannelId, campaign.id]);

  async function saveChannel(ev: React.FormEvent): Promise<void> {
    ev.preventDefault();
    setSaving(true);
    try {
      onCampaignUpdated(
        await updateCampaign({
          id: campaign.id,
          discordChannelId: channelId.trim() || null,
        }),
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
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
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="discord-settings" aria-labelledby="discord-settings-heading">
      <h3 id="discord-settings-heading">{t('liveSession.discordSettingsTitle')}</h3>
      <p className="vault-section-help">{t('liveSession.discordSettingsHint')}</p>

      <form onSubmit={(ev) => void saveChannel(ev)}>
        <Field label={t('liveSession.voiceChannelId')} htmlFor="discord-channel-id">
          <input
            id="discord-channel-id"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder={t('liveSession.voiceChannelPlaceholder')}
            autoComplete="off"
          />
        </Field>
        <div className="form-actions">
          <Button type="submit" variant="primary" icon={ActionIcons.save} disabled={saving}>
            {saving ? t('common.saving') : t('liveSession.saveChannel')}
          </Button>
        </div>
      </form>

      <form onSubmit={(ev) => void saveToken(ev)}>
        <Field label={t('liveSession.botToken')} htmlFor="discord-bot-token">
          <input
            id="discord-bot-token"
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder={
              tokenConfigured ? t('liveSession.botTokenReplacePlaceholder') : t('liveSession.botTokenPlaceholder')
            }
            autoComplete="off"
          />
        </Field>
        <p className="vault-section-help" role="status">
          {tokenConfigured ? t('liveSession.botTokenConfigured') : t('liveSession.botTokenMissing')}
        </p>
        <div className="form-actions">
          <Button type="submit" icon={ActionIcons.save} disabled={saving || !botToken.trim()}>
            {saving ? t('common.saving') : t('liveSession.saveBotToken')}
          </Button>
        </div>
      </form>
    </section>
  );
}

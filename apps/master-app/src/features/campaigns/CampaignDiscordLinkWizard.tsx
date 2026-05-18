import type { Campaign, DiscordGuildOption, DiscordVoiceChannelOption } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { updateCampaign } from '../../bridge/campaigns.js';
import {
  discordIsBotInGuild,
  discordListAdminGuilds,
  discordListVoiceChannels,
  discordOauthClear,
  discordOauthStart,
  discordOpenBotInvite,
} from '../../bridge/discord-setup.js';
import { formatInvokeErrorMessage } from '../../bridge/parse-invoke-error.js';
import { hasDiscordBotToken } from '../../bridge/session-pipeline.js';
import { Button } from '../../components/ui/Button.js';
import { Field } from '../../components/ui/Field.js';

type WizardStep = 'prereq' | 'login' | 'guild' | 'invite' | 'channel';

type Props = {
  campaign: Campaign;
  onCampaignUpdated: (campaign: Campaign) => void;
  onError: (message: string) => void;
  onConfigureToken?: () => void;
};

export function CampaignDiscordLinkWizard({
  campaign,
  onCampaignUpdated,
  onError,
  onConfigureToken,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [step, setStep] = useState<WizardStep>('prereq');
  const [busy, setBusy] = useState(false);
  const [guilds, setGuilds] = useState<DiscordGuildOption[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [botInGuild, setBotInGuild] = useState(false);
  const [channels, setChannels] = useState<DiscordVoiceChannelOption[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState(campaign.discordChannelId ?? '');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [manualChannelId, setManualChannelId] = useState(campaign.discordChannelId ?? '');

  const checkPrereq = useCallback(async () => {
    try {
      const ok = await hasDiscordBotToken();
      setStep(ok ? 'login' : 'prereq');
    } catch (err) {
      onError(formatInvokeErrorMessage(err));
    }
  }, [onError]);

  useEffect(() => {
    void checkPrereq();
  }, [checkPrereq]);

  useEffect(() => {
    setSelectedChannelId(campaign.discordChannelId ?? '');
    setManualChannelId(campaign.discordChannelId ?? '');
  }, [campaign.discordChannelId, campaign.id]);

  async function runLogin(): Promise<void> {
    setBusy(true);
    try {
      await discordOauthStart();
      const list = await discordListAdminGuilds();
      setGuilds(list);
      setStep('guild');
    } catch (err) {
      onError(formatInvokeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function selectGuild(guildId: string): void {
    if (!guildId) return;
    setSelectedGuildId(guildId);
    setStep('invite');
    setBotInGuild(false);
    setChannels([]);
  }

  async function inviteBot(): Promise<void> {
    if (!selectedGuildId) return;
    setBusy(true);
    try {
      await discordOpenBotInvite(selectedGuildId);
    } catch (err) {
      onError(formatInvokeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function checkBotAndContinue(): Promise<void> {
    if (!selectedGuildId) return;
    setBusy(true);
    try {
      const present = await discordIsBotInGuild(selectedGuildId);
      setBotInGuild(present);
      if (!present) {
        onError(t('campaign.discord.botNotInGuild'));
        return;
      }
      const list = await discordListVoiceChannels(selectedGuildId);
      setChannels(list);
      setStep('channel');
    } catch (err) {
      onError(formatInvokeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveChannel(channelId: string): Promise<void> {
    setBusy(true);
    try {
      const updated = await updateCampaign({
        id: campaign.id,
        discordChannelId: channelId.trim() || null,
      });
      onCampaignUpdated(updated);
      await discordOauthClear();
    } catch (err) {
      onError(formatInvokeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const selectedGuild = guilds.find((g) => g.id === selectedGuildId);

  return (
    <section
      className="vault-campaign__metadata"
      role="tabpanel"
      aria-labelledby="campaign-discord-wizard-heading"
    >
      <h3 id="campaign-discord-wizard-heading">{t('campaign.discord.title')}</h3>
      <p className="vault-section-help">{t('campaign.discord.hint')}</p>

      {campaign.discordChannelId ? (
        <p className="vault-section-help" role="status">
          {t('campaign.discord.currentChannel', {
            id: campaign.discordChannelId,
          })}
        </p>
      ) : null}

      {step === 'prereq' ? (
        <div className="discord-wizard-panel">
          <p>{t('campaign.discord.needToken')}</p>
          {onConfigureToken ? (
            <Button type="button" variant="primary" onClick={onConfigureToken}>
              {t('campaign.discord.configureToken')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {step === 'login' ? (
        <div className="discord-wizard-panel">
          <Button type="button" variant="primary" disabled={busy} onClick={() => void runLogin()}>
            {busy ? t('common.loading') : t('campaign.discord.loginDiscord')}
          </Button>
        </div>
      ) : null}

      {step === 'guild' ? (
        <div className="discord-wizard-panel">
          <Field label={t('campaign.discord.selectGuild')} htmlFor="discord-guild-select">
            <select
              id="discord-guild-select"
              value={selectedGuildId ?? ''}
              onChange={(e) => selectGuild(e.target.value)}
            >
              <option value="">{t('campaign.discord.guildPlaceholder')}</option>
              {guilds.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {g.botPresent ? ` (${t('campaign.discord.botPresent')})` : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}

      {step === 'invite' && selectedGuild ? (
        <div className="discord-wizard-panel">
          <p className="vault-section-help">
            {t('campaign.discord.inviteHint', { name: selectedGuild.name })}
          </p>
          <div className="discord-wizard-actions">
            <Button
              type="button"
              variant="default"
              disabled={busy}
              onClick={() => void inviteBot()}
            >
              {t('campaign.discord.inviteBot')}
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={() => void checkBotAndContinue()}
            >
              {busy ? t('common.loading') : t('campaign.discord.continue')}
            </Button>
          </div>
          {botInGuild === false && selectedGuild.botPresent ? (
            <p className="vault-section-help">{t('campaign.discord.botMaybePresent')}</p>
          ) : null}
        </div>
      ) : null}

      {step === 'channel' ? (
        <div className="discord-wizard-panel">
          <Field label={t('campaign.discord.selectChannel')} htmlFor="discord-channel-select">
            <select
              id="discord-channel-select"
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
            >
              <option value="">{t('campaign.discord.channelPlaceholder')}</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.parentName ? `${ch.parentName} / ` : ''}
                  {ch.name}
                  {ch.kind === 'stage' ? ` (${t('campaign.discord.stage')})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Button
            type="button"
            variant="primary"
            disabled={busy || !selectedChannelId}
            onClick={() => void saveChannel(selectedChannelId)}
          >
            {busy ? t('common.saving') : t('campaign.discord.saveChannel')}
          </Button>
        </div>
      ) : null}

      <details
        className="discord-wizard-advanced"
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
      >
        <summary>{t('campaign.discord.advanced')}</summary>
        <Field label={t('campaign.discord.manualChannelId')} htmlFor="discord-channel-manual">
          <input
            id="discord-channel-manual"
            value={manualChannelId}
            onChange={(e) => setManualChannelId(e.target.value)}
            placeholder={t('campaign.discord.manualChannelPlaceholder')}
            autoComplete="off"
          />
        </Field>
        <Button
          type="button"
          variant="default"
          disabled={busy || !manualChannelId.trim()}
          onClick={() => void saveChannel(manualChannelId)}
        >
          {busy ? t('common.saving') : t('campaign.discord.saveChannel')}
        </Button>
      </details>
    </section>
  );
}

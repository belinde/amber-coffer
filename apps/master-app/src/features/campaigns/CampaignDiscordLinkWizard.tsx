import type { Campaign, DiscordGuildOption, DiscordVoiceChannelOption } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { updateCampaign } from '../../bridge/campaigns.js';
import {
  discordIsBotInGuild,
  discordListAdminGuilds,
  discordListVoiceChannels,
  discordOauthStart,
  discordOauthStatus,
  discordOpenBotInvite,
} from '../../bridge/discord-setup.js';
import { formatInvokeErrorMessage, parseInvokeError } from '../../bridge/parse-invoke-error.js';
import { hasDiscordBotToken } from '../../bridge/session-pipeline.js';
import { Button } from '../../components/ui/Button.js';
import { Field } from '../../components/ui/Field.js';
import { translateFieldErrors } from '../validation/translate-validation-issue.js';

import { formatVoiceChannelLabel } from './format-voice-channel-label.js';

type WizardStep = 'prereq' | 'login' | 'guild' | 'invite' | 'channel';

const USER_OAUTH_EXPIRED = 'user_oauth_expired';

function isUserOauthExpired(err: unknown): boolean {
  const validation = parseInvokeError(err);
  return validation?.issues.some((issue) => issue.code === USER_OAUTH_EXPIRED) ?? false;
}

function formatDiscordWizardError(err: unknown, t: (key: string) => string): string {
  const validation = parseInvokeError(err);
  if (validation) {
    const mapped = translateFieldErrors(t, validation.issues);
    if (mapped.discord) return mapped.discord;
  }
  return formatInvokeErrorMessage(err);
}

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
  const isConfigured = Boolean(campaign.discordChannelId);
  const [editing, setEditing] = useState(false);
  const showWizard = !isConfigured || editing;

  const [step, setStep] = useState<WizardStep>('prereq');
  const [busy, setBusy] = useState(false);
  const [guilds, setGuilds] = useState<DiscordGuildOption[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(
    campaign.discordGuildId ?? null,
  );
  const [botInGuild, setBotInGuild] = useState(false);
  const [channels, setChannels] = useState<DiscordVoiceChannelOption[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState(campaign.discordChannelId ?? '');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [manualChannelId, setManualChannelId] = useState(campaign.discordChannelId ?? '');

  const trySkipLogin = useCallback(async (): Promise<boolean> => {
    const status = await discordOauthStatus();
    if (!status.connected) return false;
    try {
      const list = await discordListAdminGuilds();
      setGuilds(list);
      setStep('guild');
      return true;
    } catch (err) {
      if (isUserOauthExpired(err)) {
        setStep('login');
        return false;
      }
      throw err;
    }
  }, []);

  const checkPrereq = useCallback(async () => {
    if (!showWizard) return;
    try {
      const ok = await hasDiscordBotToken();
      if (!ok) {
        setStep('prereq');
        return;
      }
      // Guild list for configured campaigns is loaded only via ensureGuildsForEdit (Modifica).
      if (editing && isConfigured) return;
      if (guilds.length > 0) {
        setStep('guild');
        return;
      }
      const skipped = await trySkipLogin().catch((err) => {
        if (!isUserOauthExpired(err)) {
          onError(formatDiscordWizardError(err, t));
        }
        return false;
      });
      if (!skipped) setStep('login');
    } catch (err) {
      onError(formatDiscordWizardError(err, t));
    }
  }, [editing, guilds.length, isConfigured, onError, showWizard, t, trySkipLogin]);

  useEffect(() => {
    void checkPrereq();
  }, [checkPrereq]);

  useEffect(() => {
    if (!showWizard) return;
    setSelectedChannelId(campaign.discordChannelId ?? '');
    setManualChannelId(campaign.discordChannelId ?? '');
    setSelectedGuildId(campaign.discordGuildId ?? null);
  }, [campaign.discordChannelId, campaign.discordGuildId, campaign.id, showWizard]);

  async function ensureGuildsForEdit(): Promise<void> {
    if (guilds.length > 0) {
      setStep('guild');
      return;
    }
    setBusy(true);
    try {
      const skipped = await trySkipLogin();
      if (!skipped) setStep('login');
    } catch (err) {
      if (isUserOauthExpired(err)) {
        setStep('login');
      }
      onError(formatDiscordWizardError(err, t));
    } finally {
      setBusy(false);
    }
  }

  function startEditing(): void {
    setEditing(true);
    setSelectedGuildId(campaign.discordGuildId ?? null);
    setSelectedChannelId(campaign.discordChannelId ?? '');
    setChannels([]);
    void ensureGuildsForEdit();
  }

  async function runLogin(): Promise<void> {
    setBusy(true);
    try {
      await discordOauthStart();
      const list = await discordListAdminGuilds();
      setGuilds(list);
      setStep('guild');
    } catch (err) {
      if (isUserOauthExpired(err)) {
        setStep('login');
      }
      onError(formatDiscordWizardError(err, t));
    } finally {
      setBusy(false);
    }
  }

  function onGuildSelectChange(guildId: string): void {
    if (!guildId) {
      setSelectedGuildId(null);
      setChannels([]);
      setSelectedChannelId('');
      return;
    }
    setSelectedGuildId(guildId);
    setChannels([]);
    setSelectedChannelId('');
  }

  async function confirmGuildSelection(): Promise<void> {
    if (!selectedGuildId) return;
    setBusy(true);
    try {
      const list = await discordListVoiceChannels(selectedGuildId);
      setChannels(list);
      setBotInGuild(true);
      setStep('channel');
    } catch {
      setBotInGuild(false);
      setStep('invite');
    } finally {
      setBusy(false);
    }
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
    const trimmed = channelId.trim();
    if (!trimmed || !selectedGuildId) return;

    const guild = guilds.find((g) => g.id === selectedGuildId);
    const channel = channels.find((ch) => ch.id === trimmed);
    const stageLabel = t('campaign.discord.stage');
    const guildName = guild?.name ?? campaign.discordGuildName ?? null;
    const channelName = channel
      ? formatVoiceChannelLabel(channel, stageLabel)
      : (campaign.discordChannelName ?? trimmed);

    setBusy(true);
    try {
      const updated = await updateCampaign({
        id: campaign.id,
        discordChannelId: trimmed,
        discordGuildId: selectedGuildId,
        discordGuildName: guildName,
        discordChannelName: channelName,
      });
      setEditing(false);
      onCampaignUpdated(updated);
    } catch (err) {
      onError(formatInvokeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const selectedGuild = guilds.find((g) => g.id === selectedGuildId);
  const configuredGuildLabel =
    campaign.discordGuildName ?? campaign.discordGuildId ?? t('campaign.discord.unknownLabel');
  const configuredChannelLabel =
    campaign.discordChannelName ?? campaign.discordChannelId ?? t('campaign.discord.unknownLabel');

  if (isConfigured && !showWizard) {
    return (
      <section
        className="vault-campaign__metadata"
        role="tabpanel"
        aria-labelledby="campaign-discord-wizard-heading"
      >
        <h3 id="campaign-discord-wizard-heading">{t('campaign.discord.title')}</h3>
        <p className="vault-section-help">{t('campaign.discord.hint')}</p>

        <div className="discord-bot-configured discord-campaign-link-configured" role="status">
          <div className="discord-campaign-link-configured__copy">
            <p className="discord-bot-configured__message">
              {t('campaign.discord.configuredSummary')}
            </p>
            <p className="discord-campaign-link-configured__route">
              {t('campaign.discord.configuredRoute', {
                guild: configuredGuildLabel,
                channel: configuredChannelLabel,
              })}
            </p>
          </div>
          <Button type="button" variant="primary" onClick={startEditing}>
            {t('campaign.discord.editLink')}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="vault-campaign__metadata"
      role="tabpanel"
      aria-labelledby="campaign-discord-wizard-heading"
    >
      <h3 id="campaign-discord-wizard-heading">{t('campaign.discord.title')}</h3>
      <p className="vault-section-help">{t('campaign.discord.hint')}</p>

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
          <p className="vault-section-help">{t('campaign.discord.oauthReconnectHint')}</p>
          <Button type="button" variant="primary" disabled={busy} onClick={() => void runLogin()}>
            {busy ? t('common.loading') : t('campaign.discord.loginDiscord')}
          </Button>
        </div>
      ) : null}

      {step === 'guild' ? (
        <div className="discord-wizard-panel">
          <Field label={t('campaign.discord.selectGuild')} htmlFor="discord-guild-select">
            <div className="discord-wizard-channel-row">
              <select
                id="discord-guild-select"
                value={selectedGuildId ?? ''}
                disabled={busy}
                onChange={(e) => onGuildSelectChange(e.target.value)}
              >
                <option value="">{t('campaign.discord.guildPlaceholder')}</option>
                {guilds.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.botPresent ? ` (${t('campaign.discord.botPresent')})` : ''}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="primary"
                className="discord-wizard-channel-row__save"
                disabled={busy || !selectedGuildId}
                onClick={() => void confirmGuildSelection()}
              >
                {busy ? t('common.loading') : t('campaign.discord.continue')}
              </Button>
            </div>
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
            <div className="discord-wizard-channel-row">
              <select
                id="discord-channel-select"
                value={selectedChannelId}
                disabled={busy}
                onChange={(e) => setSelectedChannelId(e.target.value)}
              >
                <option value="">{t('campaign.discord.channelPlaceholder')}</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {formatVoiceChannelLabel(ch, t('campaign.discord.stage'))}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="primary"
                className="discord-wizard-channel-row__save"
                disabled={busy || !selectedChannelId}
                onClick={() => void saveChannel(selectedChannelId)}
              >
                {busy ? t('common.saving') : t('campaign.discord.saveChannel')}
              </Button>
            </div>
          </Field>
        </div>
      ) : null}

      <details
        className="discord-wizard-advanced"
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
      >
        <summary>{t('campaign.discord.advanced')}</summary>
        <Field label={t('campaign.discord.manualChannelId')} htmlFor="discord-channel-manual">
          <div className="discord-wizard-channel-row">
            <input
              id="discord-channel-manual"
              value={manualChannelId}
              onChange={(e) => setManualChannelId(e.target.value)}
              placeholder={t('campaign.discord.manualChannelPlaceholder')}
              autoComplete="off"
            />
            <Button
              type="button"
              variant="default"
              className="discord-wizard-channel-row__save"
              disabled={busy || !manualChannelId.trim() || !selectedGuildId}
              onClick={() => void saveChannel(manualChannelId)}
            >
              {busy ? t('common.saving') : t('campaign.discord.saveChannel')}
            </Button>
          </div>
        </Field>
      </details>

      {isConfigured ? (
        <div className="discord-wizard-footer">
          <Button
            type="button"
            variant="default"
            className="discord-wizard-footer__btn"
            disabled={busy}
            onClick={() => setEditing(false)}
          >
            {t('common.cancel')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

import type { Campaign, Character, DiscordGuildMemberOption } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listCharacters } from '../../../bridge/characters.js';
import {
  discordEnsureUserOauth,
  discordListGuildMembers,
  discordSearchGuildMembers,
} from '../../../bridge/discord-setup.js';
import { formatInvokeErrorMessage, parseInvokeError } from '../../../bridge/parse-invoke-error.js';
import { hasDiscordBotToken } from '../../../bridge/session-pipeline.js';
import { Button } from '../../../components/ui/Button.js';
import { translateFieldErrors } from '../../validation/translate-validation-issue.js';

const LARGE_GUILD_THRESHOLD = 200;
const SEARCH_DEBOUNCE_MS = 300;

type Props = {
  campaign: Campaign;
  characterId: string | undefined;
  value: string | null;
  onChange: (playerDiscordId: string | null) => void;
  error?: string | undefined;
  onConfigureDiscord?: (() => void) | undefined;
};

export function DiscordPlayerPicker({
  campaign,
  characterId,
  value,
  onChange,
  error,
  onConfigureDiscord,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [members, setMembers] = useState<DiscordGuildMemberOption[]>([]);
  const [searchResults, setSearchResults] = useState<DiscordGuildMemberOption[] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [manualId, setManualId] = useState(value ?? '');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [botReady, setBotReady] = useState<boolean | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);

  const guildId = campaign.discordGuildId;
  const useSearchPrimary = members.length > LARGE_GUILD_THRESHOLD;

  const loadRoster = useCallback(async () => {
    if (!guildId) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      await discordEnsureUserOauth();
      const roster = await discordListGuildMembers(guildId);
      setMembers(roster);
      setSearchResults(null);
    } catch (err) {
      const validation = parseInvokeError(err);
      if (validation) {
        const mapped = translateFieldErrors(t, validation.issues);
        setStatusMessage(mapped.discord ?? t('character.discordPicker.intentRequired'));
      } else {
        setStatusMessage(formatInvokeErrorMessage(err));
      }
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [guildId, t]);

  useEffect(() => {
    void hasDiscordBotToken().then(setBotReady);
  }, []);

  useEffect(() => {
    if (!guildId || botReady !== true) return;
    void loadRoster();
  }, [botReady, guildId, loadRoster]);

  useEffect(() => {
    void listCharacters(campaign.id)
      .then(setCharacters)
      .catch(() => setCharacters([]));
  }, [campaign.id]);

  useEffect(() => {
    if (!value) {
      setDuplicateWarning(null);
      return;
    }
    const other = characters.find((c) => c.playerDiscordId === value && c.id !== characterId);
    setDuplicateWarning(
      other ? t('character.discordPicker.duplicateWarning', { name: other.name }) : null,
    );
  }, [characterId, characters, t, value]);

  useEffect(() => {
    if (!guildId || !useSearchPrimary) return;
    const q = searchQuery.trim();
    if (q.length < 1) {
      setSearchResults(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void discordSearchGuildMembers(guildId, q)
        .then(setSearchResults)
        .catch((err) => {
          setStatusMessage(formatInvokeErrorMessage(err));
          setSearchResults([]);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [guildId, searchQuery, useSearchPrimary]);

  const displayMembers = useMemo(() => {
    if (useSearchPrimary) {
      if (searchQuery.trim().length > 0) {
        return searchResults ?? [];
      }
      return members.slice(0, 50);
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.username.toLowerCase().includes(q) ||
        m.id.includes(q),
    );
  }, [members, searchQuery, searchResults, useSearchPrimary]);

  if (!guildId) {
    return (
      <p className="vault-section-help" role="status">
        {t('character.discordPicker.needCampaignDiscord')}
      </p>
    );
  }

  if (botReady === false) {
    return (
      <div className="discord-player-picker">
        <p className="vault-section-help">{t('character.discordPicker.needBotToken')}</p>
        {onConfigureDiscord ? (
          <Button type="button" variant="default" onClick={onConfigureDiscord}>
            {t('character.discordPicker.configureBot')}
          </Button>
        ) : null}
      </div>
    );
  }

  if (manualMode) {
    return (
      <div className="discord-player-picker">
        <input
          value={manualId}
          onChange={(e) => {
            setManualId(e.target.value);
            onChange(e.target.value.trim() || null);
          }}
          placeholder={t('character.playerDiscordIdPlaceholder')}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
        />
        <Button type="button" variant="default" onClick={() => setManualMode(false)}>
          {t('character.discordPicker.usePicker')}
        </Button>
        {error ? <p className="field-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="discord-player-picker">
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={
          useSearchPrimary
            ? t('character.discordPicker.searchPlaceholder')
            : t('character.discordPicker.filterPlaceholder')
        }
        autoComplete="off"
      />
      <select
        value={value ?? ''}
        disabled={loading}
        onChange={(e) => onChange(e.target.value || null)}
        aria-invalid={error ? true : undefined}
      >
        <option value="">{t('character.discordPicker.none')}</option>
        {displayMembers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName} (@{m.username})
          </option>
        ))}
      </select>
      {loading ? <p className="vault-section-help">{t('common.loading')}</p> : null}
      {statusMessage ? (
        <p className="field-error" role="alert">
          {statusMessage}
        </p>
      ) : null}
      {duplicateWarning ? (
        <p className="vault-section-help" role="status">
          {duplicateWarning}
        </p>
      ) : null}
      {error ? <p className="field-error">{error}</p> : null}
      <div className="discord-player-picker__actions">
        <Button
          type="button"
          variant="default"
          disabled={loading}
          onClick={() => void loadRoster()}
        >
          {t('character.discordPicker.refreshRoster')}
        </Button>
        <Button type="button" variant="default" onClick={() => setManualMode(true)}>
          {t('character.discordPicker.manualId')}
        </Button>
      </div>
    </div>
  );
}

import type { Campaign, Character, Session, SessionDiscordParticipant } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listCharacters } from '../../bridge/characters.js';
import { formatInvokeErrorMessage } from '../../bridge/parse-invoke-error.js';
import {
  addSessionSharedAccountCharacter,
  listSessionDiscordParticipants,
  upsertSessionDiscordAssignment,
} from '../../bridge/session-discord-participants.js';
import { Button } from '../../components/ui/Button.js';

type Props = {
  session: Session;
  campaignId: Campaign['id'];
  onError: (message: string) => void;
  onOpenCharacters?: (() => void) | undefined;
};

export function SessionDiscordParticipantsPanel({
  session,
  campaignId,
  onError,
  onOpenCharacters,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [participants, setParticipants] = useState<SessionDiscordParticipant[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [rows, chars] = await Promise.all([
        listSessionDiscordParticipants(session.id),
        listCharacters(campaignId),
      ]);
      setParticipants(rows);
      setCharacters(chars.filter((c) => c.status === 'active'));
    } catch (err) {
      onError(formatInvokeErrorMessage(err));
    }
  }, [campaignId, onError, session.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function setPrimaryCharacter(
    participant: SessionDiscordParticipant,
    characterId: string | null,
  ): Promise<void> {
    setBusy(true);
    try {
      await upsertSessionDiscordAssignment({
        sessionId: session.id,
        discordUserId: participant.discordUserId,
        characterId: characterId as Character['id'] | null,
        isPrimary: true,
      });
      await refresh();
    } catch (err) {
      onError(formatInvokeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function addSharedCharacter(
    participant: SessionDiscordParticipant,
    characterId: string,
  ): Promise<void> {
    setBusy(true);
    try {
      await addSessionSharedAccountCharacter(session.id, participant.discordUserId, characterId);
      await refresh();
    } catch (err) {
      onError(formatInvokeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (participants.length === 0) {
    return (
      <p className="session-discord-participants__empty">{t('sessionDetail.noParticipants')}</p>
    );
  }

  const gm = participants.find((p) => p.isGm);
  const players = participants.filter((p) => !p.isGm);

  return (
    <section
      className="session-discord-participants"
      aria-labelledby="session-discord-participants-heading"
    >
      <h5 id="session-discord-participants-heading">{t('sessionDetail.participantsTitle')}</h5>
      <p className="session-workflow__step-hint">
        {t('sessionDetail.playerCount', { count: players.length })}
      </p>

      {gm ? (
        <div className="session-discord-participants__gm">
          <div className="session-discord-participants__card session-discord-participants__card--gm">
            <span className="session-discord-participants__badge">
              {t('sessionDetail.participantGm')}
            </span>
            <strong className="session-discord-participants__name">{gm.displayName}</strong>
            <span className="session-discord-participants__id">{gm.discordUserId}</span>
            <p className="session-discord-participants__hint">
              {t('sessionDetail.participantGmHint')}
            </p>
          </div>
        </div>
      ) : null}

      {players.length > 0 ? (
        <div className="session-discord-participants__players">
          <h6 className="session-discord-participants__subheading">
            {t('sessionDetail.participantPlayersTitle')}
          </h6>
          <ul className="session-discord-participants__list">
            {players.map((participant) => (
              <PlayerParticipantCard
                key={participant.discordUserId}
                participant={participant}
                characters={characters}
                busy={busy}
                onSetPrimaryCharacter={(characterId) =>
                  void setPrimaryCharacter(participant, characterId)
                }
                onAddSharedCharacter={(characterId) =>
                  void addSharedCharacter(participant, characterId)
                }
                onOpenCharacters={onOpenCharacters}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

type PlayerCardProps = {
  participant: SessionDiscordParticipant;
  characters: Character[];
  busy: boolean;
  onSetPrimaryCharacter: (characterId: string | null) => void;
  onAddSharedCharacter: (characterId: string) => void;
  onOpenCharacters?: (() => void) | undefined;
};

function PlayerParticipantCard({
  participant,
  characters,
  busy,
  onSetPrimaryCharacter,
  onAddSharedCharacter,
  onOpenCharacters,
}: PlayerCardProps): ReactElement {
  const { t } = useTranslation();
  const primary = participant.assignments.find((a) => a.isPrimary);
  const primaryCharacterId = primary?.characterId ?? null;
  const sharedCount = participant.assignments.length;
  const usedCharacterIds = new Set(
    participant.assignments
      .map((a) => a.characterId)
      .filter((id): id is NonNullable<typeof id> => id !== null),
  );

  const availableForShared = characters.filter((c) => !usedCharacterIds.has(c.id));

  return (
    <li className="session-discord-participants__item">
      <div className="session-discord-participants__card">
        <strong className="session-discord-participants__name">{participant.displayName}</strong>
        <span className="session-discord-participants__id">{participant.discordUserId}</span>
        {participant.defaultCharacterName ? (
          <p className="session-discord-participants__default">
            {t('sessionDetail.participantDefaultCharacter', {
              name: participant.defaultCharacterName,
            })}
          </p>
        ) : (
          <p className="session-discord-participants__default session-discord-participants__default--none">
            {t('sessionDetail.participantNoDefaultCharacter')}
          </p>
        )}

        <label className="session-discord-participants__label">
          {t('sessionDetail.participantSessionCharacter')}
          <select
            className="session-discord-participants__select"
            disabled={busy}
            value={primaryCharacterId ?? ''}
            onChange={(e) => {
              const value = e.target.value;
              onSetPrimaryCharacter(value === '' ? null : value);
            }}
          >
            <option value="">{t('sessionDetail.participantUnassigned')}</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {sharedCount > 1 ? (
          <p className="session-discord-participants__shared-badge">
            {t('sessionDetail.participantSharedAccount')}
          </p>
        ) : null}
        <p className="session-discord-participants__hint">
          {t('sessionDetail.participantSharedAccountHint')}
        </p>

        {availableForShared.length > 0 ? (
          <label className="session-discord-participants__label">
            {t('sessionDetail.participantAddSharedCharacter')}
            <select
              className="session-discord-participants__select"
              disabled={busy}
              defaultValue=""
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;
                onAddSharedCharacter(value);
                e.target.value = '';
              }}
            >
              <option value="">
                {t('sessionDetail.participantAddSharedCharacterPlaceholder')}
              </option>
              {availableForShared.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {onOpenCharacters ? (
          <Button type="button" variant="default" disabled={busy} onClick={onOpenCharacters}>
            {t('sessionDetail.participantEditCampaignLinks')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

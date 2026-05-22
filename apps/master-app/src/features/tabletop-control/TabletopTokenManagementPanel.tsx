import type { Campaign, Character, Map, Npc, Session, Token } from '@amber/shared';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listCharacters } from '../../bridge/characters.js';
import { listNpcs } from '../../bridge/npcs.js';
import { Button } from '../../components/ui/Button.js';

import {
  createCustomSessionToken,
  ensureCampaignCharacterTokens,
  placeToken,
  removeToken,
  setTokenController,
  setTokenVisibility,
} from './bridge.js';
import { buildTokenDisplayMaps } from './build-token-display-maps.js';
import { TabletopControllerPicker } from './TabletopControllerPicker.js';

type Props = {
  campaignId: Campaign['id'];
  sessionId: Session['id'];
  activeMap: Map;
  tokens: Token[];
  onTokensChanged: () => void;
  onError: (message: string) => void;
};

export function TabletopTokenManagementPanel({
  campaignId,
  sessionId,
  activeMap,
  tokens,
  onTokensChanged,
  onError,
}: Props): ReactElement {
  const { t } = useTranslation();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [npcs, setNpcs] = useState<Npc[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [placeNpcId, setPlaceNpcId] = useState('');
  const [placeCharacterId, setPlaceCharacterId] = useState('');
  const [customTokenName, setCustomTokenName] = useState('');
  const [customTokenController, setCustomTokenController] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadMeta = useCallback(async () => {
    try {
      const [chars, npcList] = await Promise.all([
        listCharacters(campaignId),
        listNpcs(campaignId),
      ]);
      setCharacters(chars);
      setNpcs(npcList);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }, [campaignId, onError]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const { labels, names } = useMemo(
    () => buildTokenDisplayMaps(tokens, characters, npcs),
    [tokens, characters, npcs],
  );

  const selectedToken = tokens.find((tok) => tok.id === selectedTokenId) ?? null;

  const linkedControllerCount = useMemo(
    () => characters.filter((c) => c.playerDiscordId).length,
    [characters],
  );

  const npcsWithoutToken = useMemo(() => {
    const onMap = new Set(
      tokens.filter((tok) => tok.entityKind === 'npc').map((tok) => tok.entityId),
    );
    return npcs.filter((npc) => !onMap.has(npc.id));
  }, [npcs, tokens]);

  const charactersWithoutToken = useMemo(() => {
    const onMap = new Set(
      tokens.filter((tok) => tok.entityKind === 'character').map((tok) => tok.entityId),
    );
    return characters.filter((c) => c.status === 'active' && !onMap.has(c.id));
  }, [characters, tokens]);

  async function runMutation(fn: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await fn();
      onTokensChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePlaceNpc(): Promise<void> {
    if (!placeNpcId) {
      return;
    }
    await runMutation(async () => {
      await placeToken({
        mapId: activeMap.id,
        entityKind: 'npc',
        entityId: placeNpcId,
      });
      setPlaceNpcId('');
    });
  }

  async function handlePlaceCharacter(): Promise<void> {
    if (!placeCharacterId) {
      return;
    }
    await runMutation(async () => {
      await placeToken({
        mapId: activeMap.id,
        entityKind: 'character',
        entityId: placeCharacterId,
      });
      setPlaceCharacterId('');
    });
  }

  async function handleRestoreCharacterTokens(): Promise<void> {
    await runMutation(async () => {
      await ensureCampaignCharacterTokens(campaignId);
    });
  }

  async function handleCreateCustomToken(): Promise<void> {
    const name = customTokenName.trim();
    if (!name) {
      return;
    }
    await runMutation(async () => {
      await createCustomSessionToken({
        sessionId,
        mapId: activeMap.id,
        displayName: name,
        controlledByDiscordId: customTokenController,
      });
      setCustomTokenName('');
      setCustomTokenController(null);
    });
  }

  function entityKindLabel(kind: Token['entityKind']): string {
    if (kind === 'custom') {
      return t('sessions.tabletop.entityKindCustom');
    }
    return kind;
  }

  return (
    <aside
      className="session-tabletop__token-panel"
      aria-label={t('sessions.tabletop.tokenPanelAria')}
    >
      <h4 className="session-tabletop__token-panel-title">
        {t('sessions.tabletop.tokenPanelTitle')}
      </h4>

      <label className="session-tabletop__token-field">
        <span>{t('sessions.tabletop.selectToken')}</span>
        <select
          value={selectedTokenId ?? ''}
          onChange={(e) => setSelectedTokenId(e.target.value || null)}
        >
          <option value="">{t('sessions.tabletop.noTokenSelected')}</option>
          {tokens.map((token) => (
            <option key={token.id} value={token.id}>
              {names[token.id] ?? token.entityId} ({labels[token.id] ?? '?'}) —{' '}
              {entityKindLabel(token.entityKind)}
            </option>
          ))}
        </select>
      </label>

      {selectedToken ? (
        <div className="session-tabletop__token-actions">
          <label className="session-tabletop__token-field session-tabletop__token-field--checkbox">
            <input
              type="checkbox"
              checked={selectedToken.visibleToPlayers}
              disabled={busy}
              onChange={(e) =>
                void runMutation(async () => {
                  await setTokenVisibility({
                    tokenId: selectedToken.id,
                    visibleToPlayers: e.target.checked,
                  });
                })
              }
            />
            <span>{t('sessions.tabletop.visibleToPlayers')}</span>
          </label>

          <div className="session-tabletop__token-controller">
            <span className="session-tabletop__token-field-label">
              {t('sessions.tabletop.assignController')}
            </span>
            <TabletopControllerPicker
              characters={characters}
              disabled={busy}
              value={selectedToken.controlledByPlayerDiscordId}
              onChange={(discordId) =>
                void runMutation(async () => {
                  await setTokenController({
                    tokenId: selectedToken.id,
                    controlledByDiscordId: discordId,
                  });
                })
              }
            />
            {linkedControllerCount === 0 ? (
              <p className="session-tabletop__token-hint">
                {t('sessions.tabletop.controllerNeedLinked')}
              </p>
            ) : null}
          </div>

          <Button
            type="button"
            variant="danger"
            disabled={busy}
            onClick={() =>
              void runMutation(async () => {
                await removeToken(selectedToken.id);
                setSelectedTokenId(null);
              })
            }
          >
            {t('sessions.tabletop.removeToken')}
          </Button>
        </div>
      ) : null}

      {charactersWithoutToken.length > 0 ? (
        <div className="session-tabletop__token-place">
          <label className="session-tabletop__token-field">
            <span>{t('sessions.tabletop.placeCharacter')}</span>
            <select value={placeCharacterId} onChange={(e) => setPlaceCharacterId(e.target.value)}>
              <option value="">{t('sessions.tabletop.chooseCharacter')}</option>
              {charactersWithoutToken.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !placeCharacterId}
            onClick={() => void handlePlaceCharacter()}
          >
            {t('sessions.tabletop.placeCharacterButton')}
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={busy}
            onClick={() => void handleRestoreCharacterTokens()}
          >
            {t('sessions.tabletop.restoreAllCharacters', {
              count: charactersWithoutToken.length,
            })}
          </Button>
        </div>
      ) : null}

      <div className="session-tabletop__token-place">
        <h5 className="session-tabletop__token-place-heading">
          {t('sessions.tabletop.placeCustomTitle')}
        </h5>
        <label className="session-tabletop__token-field">
          <span>{t('sessions.tabletop.customTokenName')}</span>
          <input
            type="text"
            value={customTokenName}
            maxLength={120}
            disabled={busy}
            placeholder={t('sessions.tabletop.customTokenNamePlaceholder')}
            onChange={(e) => setCustomTokenName(e.target.value)}
          />
        </label>
        <div className="session-tabletop__token-controller">
          <span className="session-tabletop__token-field-label">
            {t('sessions.tabletop.assignController')}
          </span>
          <TabletopControllerPicker
            characters={characters}
            disabled={busy}
            value={customTokenController}
            onChange={setCustomTokenController}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !customTokenName.trim()}
          onClick={() => void handleCreateCustomToken()}
        >
          {t('sessions.tabletop.placeCustomButton')}
        </Button>
        <p className="session-tabletop__token-hint">{t('sessions.tabletop.customTokenHint')}</p>
      </div>

      <div className="session-tabletop__token-place">
        <label className="session-tabletop__token-field">
          <span>{t('sessions.tabletop.placeNpc')}</span>
          <select value={placeNpcId} onChange={(e) => setPlaceNpcId(e.target.value)}>
            <option value="">{t('sessions.tabletop.chooseNpc')}</option>
            {npcsWithoutToken.map((npc) => (
              <option key={npc.id} value={npc.id}>
                {npc.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !placeNpcId}
          onClick={() => void handlePlaceNpc()}
        >
          {t('sessions.tabletop.placeNpcButton')}
        </Button>
      </div>
    </aside>
  );
}

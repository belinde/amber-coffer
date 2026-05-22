import type { CampaignId, DiscordUserId, Map, SessionId, Token } from '@amber/shared';
import { canPlayerMoveToken } from '@amber/tabletop-engine';
import { TabletopBoard } from '@amber/ui';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { SyncClientLike } from '../../sync/types.js';

import { publishTokenMoved } from './publish-token-moved.js';
import { sessionAssetUrl } from './session-asset-url.js';
import { tabletopStore, useTabletopState } from './store.js';

type Props = {
  map: Map;
  campaignId: CampaignId;
  sessionId: SessionId;
  playerDiscordId: DiscordUserId;
  syncClient: SyncClientLike;
};

export function TabletopPlayerView({
  map,
  campaignId,
  sessionId,
  playerDiscordId,
  syncClient,
}: Props): ReactElement {
  const { t } = useTranslation();
  const state = useTabletopState();
  const tokens = state.tokens;
  const tokenLabels = state.tokenLabels;
  const tokenNames = state.tokenNames;

  const backgroundImageUrl = map.backgroundPublicPath
    ? (sessionAssetUrl(map.backgroundPublicPath) ?? null)
    : null;

  function tokenTooltip(token: Token): string {
    return tokenNames[token.id] ?? token.entityId;
  }

  function tokenClassName(token: Token, dragging: boolean): string {
    const owned = canPlayerMoveToken(token, playerDiscordId);
    const base =
      token.position.zone === 'bench' ? 'tabletop-token tabletop-token--bench' : 'tabletop-token';
    const role = owned ? 'tabletop-token--owned' : 'tabletop-token--locked';
    return `${base} ${role}${dragging ? ' dragging' : ''}`;
  }

  return (
    <TabletopBoard
      map={map}
      tokens={tokens}
      tokenLabels={tokenLabels}
      backgroundImageUrl={backgroundImageUrl}
      labels={{
        boardAria: t('tabletop.boardAria'),
        benchAria: t('tabletop.benchAria'),
      }}
      canDragToken={(token) => canPlayerMoveToken(token, playerDiscordId)}
      getTokenInteraction={(token, { dragging }) => {
        const owned = canPlayerMoveToken(token, playerDiscordId);
        const name = tokenTooltip(token);
        return {
          className: tokenClassName(token, dragging),
          role: owned ? 'button' : 'img',
          ...(owned ? { tabIndex: 0 } : {}),
          ariaLabel: owned
            ? t('tabletop.tokenOwned', { name })
            : t('tabletop.tokenLocked', { name }),
          title: name,
        };
      }}
      onTokenMove={(tokenId, position) => {
        const token = tokens.find((tok) => tok.id === tokenId);
        if (!token) return;
        tabletopStore.dispatch({
          type: 'token.moved',
          tokenId: token.id,
          position,
        });
        void publishTokenMoved({
          client: syncClient,
          campaignId,
          sessionId,
          playerDiscordId,
          token,
          position,
        });
      }}
    >
      {state.visibleHandouts.length > 0 ? (
        <section className="tabletop-handouts" aria-label={t('tabletop.handoutsAria')}>
          {state.visibleHandouts.map((h) => (
            <article key={h.id} className="tabletop-handout">
              <header>{h.label}</header>
              {sessionAssetUrl(h.image?.thumbnailUrl) ? (
                <img src={sessionAssetUrl(h.image?.thumbnailUrl) ?? ''} alt={h.label} />
              ) : null}
              {h.body ? <p>{h.body}</p> : null}
            </article>
          ))}
        </section>
      ) : null}
    </TabletopBoard>
  );
}

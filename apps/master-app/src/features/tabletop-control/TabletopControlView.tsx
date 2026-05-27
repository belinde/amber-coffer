import type { Campaign, Map, Token } from '@amber/shared';
import { TabletopBoard } from '@amber/ui';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { resolveCampaignImagePath } from '../../bridge/campaign-images.js';

import { moveToken } from './bridge.js';

type Props = {
  campaignId: Campaign['id'];
  map: Pick<
    Map,
    'imagePath' | 'widthPx' | 'heightPx' | 'gridCols' | 'gridRows' | 'gridSizePx' | 'benchSlots'
  >;
  tokens: Token[];
  tokenLabels?: Record<string, string>;
  tokenNames?: Record<string, string>;
  canEdit?: boolean;
  onAfterMove?: () => void;
};

/**
 * Master-authoritative editor for the tabletop. Drag and drop dispatches `move_token` via Tauri.
 */
export function TabletopControlView({
  campaignId,
  map,
  tokens,
  tokenLabels = {},
  tokenNames = {},
  canEdit = true,
  onAfterMove,
}: Props): ReactElement {
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [portraitUrls, setPortraitUrls] = useState<Record<string, string>>({});

  const loadBackground = useCallback(async () => {
    const local = map.imagePath.trim();
    if (!local) {
      setBackgroundUrl(null);
      return;
    }
    try {
      const absolute = await resolveCampaignImagePath(campaignId, local);
      setBackgroundUrl(convertFileSrc(absolute));
    } catch {
      setBackgroundUrl(null);
    }
  }, [campaignId, map.imagePath]);

  useEffect(() => {
    void loadBackground();
  }, [loadBackground]);

  // Load token portrait URLs (local fallback when clip region defined)
  useEffect(() => {
    if (tokens.length === 0) {
      setPortraitUrls({});
      return;
    }
    const tokenIds = tokens.map((t) => t.id);
    void invoke<Record<string, string>>('get_token_portrait_urls', {
      campaignId,
      tokenIds,
    })
      .then(setPortraitUrls)
      .catch(() => setPortraitUrls({}));
  }, [campaignId, tokens]);

  function tokenAriaLabel(token: Token): string {
    return tokenNames[token.id] ?? token.entityId;
  }

  return (
    <TabletopBoard
      map={map}
      tokens={tokens}
      tokenLabels={tokenLabels}
      tokenNames={tokenNames}
      tokenPortraitUrls={portraitUrls}
      backgroundImageUrl={backgroundUrl}
      labels={{
        boardAria: 'Tabletop control',
        benchAria: 'Off-board parking',
      }}
      canDragToken={() => canEdit}
      getTokenInteraction={(token, { dragging }) => ({
        className: `tabletop-token${
          token.position.zone === 'bench' ? ' tabletop-token--bench' : ''
        }${dragging ? ' dragging' : ''}`,
        role: 'button',
        tabIndex: 0,
        ariaLabel: tokenAriaLabel(token),
      })}
      onTokenMove={(tokenId, position) =>
        moveToken({ tokenId, position }).then(() => onAfterMove?.())
      }
    />
  );
}

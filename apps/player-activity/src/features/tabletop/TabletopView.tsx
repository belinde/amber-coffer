import { TabletopBoard } from '@amber/ui';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { sessionAssetUrl } from './session-asset-url.js';
import { useTabletopState } from './store.js';

type Props = {
  gridCols: number;
  gridRows: number;
  benchSlots?: number;
  gridSizePx?: number;
};

/**
 * Read-only tabletop view (legacy export; live Activity uses {@link TabletopPlayerView}).
 */
export function TabletopView({
  gridCols,
  gridRows,
  benchSlots = 12,
  gridSizePx = 50,
}: Props): ReactElement {
  const { t } = useTranslation();
  const state = useTabletopState();
  const tokenNames = state.tokenNames;

  const activeMap =
    state.activeMapId !== null
      ? (state.maps.find((m) => m.id === state.activeMapId) ?? null)
      : null;

  const map =
    activeMap ??
    ({
      imagePath: '',
      widthPx: 0,
      heightPx: 0,
      gridCols,
      gridRows,
      gridSizePx,
      benchSlots,
    } as const);

  const backgroundImageUrl =
    activeMap?.backgroundPublicPath != null
      ? (sessionAssetUrl(activeMap.backgroundPublicPath) ?? null)
      : null;

  return (
    <TabletopBoard
      map={map}
      tokens={state.tokens}
      tokenLabels={state.tokenLabels}
      backgroundImageUrl={backgroundImageUrl}
      labels={{
        boardAria: t('tabletop.boardAria', { defaultValue: 'Tabletop' }),
        benchAria: t('tabletop.benchAria', { defaultValue: 'Off-board tokens' }),
      }}
      canDragToken={() => false}
      getTokenInteraction={(token) => {
        const name = tokenNames[token.id] ?? token.entityId;
        return {
          className:
            token.position.zone === 'bench'
              ? 'tabletop-token tabletop-token--bench'
              : 'tabletop-token',
          role: 'img',
          ariaLabel: name,
          title: name,
        };
      }}
    >
      {state.visibleHandouts.length > 0 ? (
        <section
          className="tabletop-handouts"
          aria-label={t('tabletop.handoutsAria', { defaultValue: 'Shared handouts' })}
        >
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

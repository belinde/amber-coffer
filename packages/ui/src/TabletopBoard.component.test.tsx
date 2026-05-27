/// <reference types="@testing-library/jest-dom" />
import { asBrandedId, type Token } from '@amber/shared';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { TabletopMapLayout } from './tabletop-board-styles.js';
import {
  TabletopBoard,
  type TabletopBoardLabels,
  type TabletopTokenInteraction,
} from './TabletopBoard.js';

const TOKEN_ID = '018f0000-0000-7000-8000-000000000001';

const defaultMap: TabletopMapLayout = {
  imagePath: '',
  widthPx: 800,
  heightPx: 600,
  gridCols: 8,
  gridRows: 6,
  gridSizePx: 50,
  benchSlots: 12,
  backgroundPublicPath: undefined,
};

const defaultLabels: TabletopBoardLabels = {
  boardAria: 'Tabletop',
  benchAria: 'Off-board tokens',
};

function makeToken(overrides: Partial<Token> = {}): Token {
  return {
    id: asBrandedId<'TokenId'>(TOKEN_ID),
    mapId: asBrandedId<'MapId'>('018f0000-0000-7000-8000-000000000010'),
    entityKind: 'character',
    entityId: 'char-1',
    sessionId: null,
    displayName: null,
    position: { zone: 'board', xCell: 0, yCell: 0 },
    visibleToPlayers: true,
    controlledByPlayerDiscordId: null,
    createdAt: 1000,
    updatedAt: 1000,
    version: 1,
    ...overrides,
  } as Token;
}

function defaultInteraction(_token: Token): TabletopTokenInteraction {
  return {
    className: 'tabletop-token',
    role: 'img',
    ariaLabel: 'Token',
  };
}

afterEach(() => {
  cleanup();
});

describe('TokenCell portrait rendering', () => {
  describe('portrait image renders when URL present', () => {
    it('renders an <img> with the portrait URL and border-radius 50%', () => {
      const token = makeToken();
      const { container } = render(
        <TabletopBoard
          map={defaultMap}
          tokens={[token]}
          tokenLabels={{ [TOKEN_ID]: 'TK' }}
          tokenPortraitUrls={{ [TOKEN_ID]: 'https://cdn.example.com/portrait.webp' }}
          tokenNames={{ [TOKEN_ID]: 'Warrior' }}
          labels={defaultLabels}
          canDragToken={() => false}
          getTokenInteraction={defaultInteraction}
        />,
      );

      const img = container.querySelector('img.tabletop-token-portrait');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://cdn.example.com/portrait.webp');
      expect(img).toHaveStyle({ borderRadius: '50%' });
    });

    it('sets the alt attribute to the token name', () => {
      const token = makeToken();
      const { container } = render(
        <TabletopBoard
          map={defaultMap}
          tokens={[token]}
          tokenLabels={{ [TOKEN_ID]: 'TK' }}
          tokenPortraitUrls={{ [TOKEN_ID]: 'https://cdn.example.com/portrait.webp' }}
          tokenNames={{ [TOKEN_ID]: 'Warrior' }}
          labels={defaultLabels}
          canDragToken={() => false}
          getTokenInteraction={defaultInteraction}
        />,
      );

      const img = container.querySelector('img.tabletop-token-portrait');
      expect(img).toHaveAttribute('alt', 'Warrior');
    });

    it('falls back to label for alt when tokenName is absent', () => {
      const token = makeToken();
      const { container } = render(
        <TabletopBoard
          map={defaultMap}
          tokens={[token]}
          tokenLabels={{ [TOKEN_ID]: 'TK' }}
          tokenPortraitUrls={{ [TOKEN_ID]: 'https://cdn.example.com/portrait.webp' }}
          labels={defaultLabels}
          canDragToken={() => false}
          getTokenInteraction={defaultInteraction}
        />,
      );

      const img = container.querySelector('img.tabletop-token-portrait');
      expect(img).toHaveAttribute('alt', 'TK');
    });
  });

  describe('fallback to label when URL absent', () => {
    it('renders the literal label when tokenPortraitUrls has no entry for the token', () => {
      const token = makeToken();
      const { container } = render(
        <TabletopBoard
          map={defaultMap}
          tokens={[token]}
          tokenLabels={{ [TOKEN_ID]: 'TK' }}
          tokenPortraitUrls={{}}
          labels={defaultLabels}
          canDragToken={() => false}
          getTokenInteraction={defaultInteraction}
        />,
      );

      const img = container.querySelector('img.tabletop-token-portrait');
      expect(img).not.toBeInTheDocument();

      const label = container.querySelector('.tabletop-token-label');
      expect(label).toBeInTheDocument();
      expect(label).toHaveTextContent('TK');
    });

    it('renders the literal label when tokenPortraitUrls prop is omitted', () => {
      const token = makeToken();
      const { container } = render(
        <TabletopBoard
          map={defaultMap}
          tokens={[token]}
          tokenLabels={{ [TOKEN_ID]: 'AB' }}
          labels={defaultLabels}
          canDragToken={() => false}
          getTokenInteraction={defaultInteraction}
        />,
      );

      const img = container.querySelector('img.tabletop-token-portrait');
      expect(img).not.toBeInTheDocument();

      const label = container.querySelector('.tabletop-token-label');
      expect(label).toBeInTheDocument();
      expect(label).toHaveTextContent('AB');
    });
  });

  describe('fallback on image load error', () => {
    it('falls back to the literal label when the image fires an error event', () => {
      const token = makeToken();
      const { container } = render(
        <TabletopBoard
          map={defaultMap}
          tokens={[token]}
          tokenLabels={{ [TOKEN_ID]: 'TK' }}
          tokenPortraitUrls={{ [TOKEN_ID]: 'https://cdn.example.com/broken.webp' }}
          tokenNames={{ [TOKEN_ID]: 'Warrior' }}
          labels={defaultLabels}
          canDragToken={() => false}
          getTokenInteraction={defaultInteraction}
        />,
      );

      // Initially the image is rendered
      const img = container.querySelector('img.tabletop-token-portrait');
      expect(img).toBeInTheDocument();

      // Simulate image load error
      fireEvent.error(img!);

      // After error, image should be gone and label should appear
      expect(container.querySelector('img.tabletop-token-portrait')).not.toBeInTheDocument();
      const label = container.querySelector('.tabletop-token-label');
      expect(label).toBeInTheDocument();
      expect(label).toHaveTextContent('TK');
    });
  });
});

import type { Handout, Token } from '@amber/shared';
import { describe, expect, it } from 'vitest';

import { initialTabletopState, tabletopReducer } from './state.js';

const mapAId = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa' as Token['mapId'];
const tokenId = 'bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb' as Token['id'];
const handoutId = 'cccccccc-cccc-7ccc-8ccc-cccccccccccc' as Handout['id'];

const sampleToken: Token = {
  id: tokenId,
  mapId: mapAId,
  entityKind: 'character',
  entityId: 'char-1',
  position: { zone: 'board', xCell: 0, yCell: 0 },
  visibleToPlayers: true,
  createdAt: 0,
  updatedAt: 0,
  version: 1,
};

const sampleHandout: Handout = {
  id: handoutId,
  campaignId: 'dddddddd-dddd-7ddd-8ddd-dddddddddddd' as Handout['campaignId'],
  sessionId: 'eeeeeeee-eeee-7eee-8eee-eeeeeeeeeeee' as Handout['sessionId'],
  label: 'A folded letter',
  visibleToPlayers: true,
  shownAt: 1,
  createdAt: 0,
  updatedAt: 1,
  version: 1,
};

describe('tabletopReducer', () => {
  it('applies a snapshot replacing previous state', () => {
    const next = tabletopReducer(initialTabletopState, {
      type: 'snapshot.applied',
      activeMapId: mapAId,
      tokens: [sampleToken],
      visibleHandouts: [sampleHandout],
    });
    expect(next.activeMapId).toBe(mapAId);
    expect(next.tokens).toHaveLength(1);
    expect(next.visibleHandouts).toHaveLength(1);
  });

  it('is idempotent on token.created', () => {
    const a = tabletopReducer(initialTabletopState, { type: 'token.created', token: sampleToken });
    const b = tabletopReducer(a, { type: 'token.created', token: sampleToken });
    expect(b.tokens).toHaveLength(1);
  });

  it('updates token position on token.moved', () => {
    const a = tabletopReducer(initialTabletopState, { type: 'token.created', token: sampleToken });
    const b = tabletopReducer(a, {
      type: 'token.moved',
      tokenId,
      position: { zone: 'bench', slot: 2 },
    });
    expect(b.tokens[0]?.position).toEqual({ zone: 'bench', slot: 2 });
  });

  it('removes tokens and handouts', () => {
    const a = tabletopReducer(initialTabletopState, { type: 'token.created', token: sampleToken });
    const b = tabletopReducer(a, { type: 'handout.shown', handout: sampleHandout });
    const c = tabletopReducer(b, { type: 'token.removed', tokenId });
    const d = tabletopReducer(c, { type: 'handout.hidden', handoutId });
    expect(d.tokens).toHaveLength(0);
    expect(d.visibleHandouts).toHaveLength(0);
  });

  it('resets on session.ended', () => {
    const a = tabletopReducer(initialTabletopState, { type: 'token.created', token: sampleToken });
    const b = tabletopReducer(a, { type: 'session.ended' });
    expect(b).toEqual(initialTabletopState);
  });
});

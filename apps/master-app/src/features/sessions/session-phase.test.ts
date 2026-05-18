import type { Session } from '@amber/shared';
import { describe, expect, it } from 'vitest';

import { isSessionPlayLocked, resolveSessionUiPhase } from './session-phase.js';

function baseSession(overrides: Partial<Session> = {}): Session {
  return {
    id: '01932f8a-0000-7000-8000-000000000001' as Session['id'],
    campaignId: '01932f8a-0000-7000-8000-000000000099' as Session['campaignId'],
    number: 1,
    title: null,
    playState: 'preparing',
    status: 'planned',
    startedAt: null,
    endedAt: null,
    summary: '',
    eventsBody: '',
    gmNotes: '',
    publicSummary: null,
    locationsVisited: [],
    npcsEncountered: [],
    playedAt: null,
    createdAt: 0,
    updatedAt: 0,
    version: 1,
    ...overrides,
  };
}

describe('resolveSessionUiPhase', () => {
  it('returns preparing for a new planned session', () => {
    expect(resolveSessionUiPhase(baseSession())).toBe('preparing');
  });

  it('returns live when playState is live', () => {
    expect(resolveSessionUiPhase(baseSession({ playState: 'live', status: 'recording' }))).toBe(
      'live',
    );
  });

  it('returns post when playState is ended', () => {
    expect(resolveSessionUiPhase(baseSession({ playState: 'ended' }))).toBe('post');
  });

  it('returns post for legacy sessions with pipeline status past recording', () => {
    expect(resolveSessionUiPhase(baseSession({ playState: 'preparing', status: 'recorded' }))).toBe(
      'post',
    );
  });
});

describe('isSessionPlayLocked', () => {
  it('is true only while live', () => {
    expect(isSessionPlayLocked(baseSession({ playState: 'live' }))).toBe(true);
    expect(isSessionPlayLocked(baseSession({ playState: 'preparing' }))).toBe(false);
  });
});

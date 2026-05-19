import { describe, expect, it } from 'vitest';

import {
  extractBearerToken,
  signActivitySessionToken,
  verifyActivitySessionToken,
} from './activity-session-token.js';

describe('activity-session-token', () => {
  const secret = 'test-secret';

  it('signs and verifies player token', () => {
    const token = signActivitySessionToken(
      {
        role: 'player',
        clientId: 'player-1',
        campaignId: '018f0000-0000-7000-8000-000000000001',
        sessionId: '018f0000-0000-7000-8000-000000000002',
        sub: '123',
        ttlSeconds: 3600,
      },
      secret,
    );
    const claims = verifyActivitySessionToken(token, secret);
    expect(claims?.role).toBe('player');
    expect(claims?.sub).toBe('123');
  });

  it('extractBearerToken parses Authorization header', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearerToken(undefined)).toBeNull();
  });
});

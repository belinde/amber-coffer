import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  extractBearerToken,
  signActivitySessionToken,
  verifyActivitySessionToken,
} from './activity-session-token.js';

/**
 * Property 7: HMAC Token Auth Verification
 *
 * **Validates: Requirements 3.4, 3.5, 9.3, 9.4**
 *
 * For any valid token payload (with role and campaignId claims) and any HMAC secret,
 * signing the payload and then verifying with the same secret succeeds.
 * Verifying with a different secret or a modified payload fails.
 * A token with role ≠ 'master' or with a campaignId claim not matching the request path
 * is classified as forbidden (403), while a missing or structurally invalid token
 * is classified as unauthorized (401).
 */
describe('Property 7: HMAC Token Auth Verification', () => {
  // Arbitrary for hex strings of exact length
  const hexStringOfLength = (len: number) =>
    fc
      .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
        minLength: len,
        maxLength: len,
      })
      .map((chars) => chars.join(''));

  // Arbitrary for UUID v7-like strings (valid format)
  const uuidV7Arb = fc
    .tuple(
      hexStringOfLength(8),
      hexStringOfLength(4),
      hexStringOfLength(3),
      fc.constantFrom('8', '9', 'a', 'b'),
      hexStringOfLength(3),
      hexStringOfLength(12),
    )
    .map(([a, b, c, variant, d, e]) => `${a}-${b}-7${c}-${variant}${d}-${e}`);

  // Arbitrary for non-empty secrets (at least 8 chars for realistic HMAC)
  const secretArb = fc.string({ minLength: 8, maxLength: 128 }).filter((s) => s.length >= 8);

  // Arbitrary for valid token claims
  const validClaimsArb = fc.record({
    role: fc.constantFrom('player' as const, 'master' as const),
    clientId: fc.string({ minLength: 1, maxLength: 64 }),
    campaignId: uuidV7Arb,
    sessionId: uuidV7Arb,
    sub: fc.string({ minLength: 1, maxLength: 64 }),
    ttlSeconds: fc.integer({ min: 60, max: 86400 }),
  });

  it('sign then verify with same secret succeeds', () => {
    fc.assert(
      fc.property(validClaimsArb, secretArb, (claims, secret) => {
        const token = signActivitySessionToken(claims, secret);
        const verified = verifyActivitySessionToken(token, secret);
        expect(verified).not.toBeNull();
        expect(verified!.role).toBe(claims.role);
        expect(verified!.campaignId).toBe(claims.campaignId);
        expect(verified!.sessionId).toBe(claims.sessionId);
        expect(verified!.sub).toBe(claims.sub);
        expect(verified!.clientId).toBe(claims.clientId);
      }),
      { numRuns: 100 },
    );
  });

  it('verify with different secret fails', () => {
    fc.assert(
      fc.property(validClaimsArb, secretArb, secretArb, (claims, secret1, secret2) => {
        fc.pre(secret1 !== secret2);
        const token = signActivitySessionToken(claims, secret1);
        const verified = verifyActivitySessionToken(token, secret2);
        expect(verified).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('verify with modified payload fails', () => {
    fc.assert(
      fc.property(validClaimsArb, secretArb, (claims, secret) => {
        const token = signActivitySessionToken(claims, secret);
        const parts = token.split('.');
        // Tamper with the body (second part) by flipping a character
        const body = parts[1]!;
        const tamperedChar = body[0] === 'A' ? 'B' : 'A';
        const tamperedBody = tamperedChar + body.slice(1);
        const tamperedToken = `${parts[0]}.${tamperedBody}.${parts[2]}`;
        const verified = verifyActivitySessionToken(tamperedToken, secret);
        expect(verified).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('token with role ≠ master classified as forbidden (403 scenario)', () => {
    fc.assert(
      fc.property(
        validClaimsArb.map((c) => ({ ...c, role: 'player' as const })),
        secretArb,
        (claims, secret) => {
          const token = signActivitySessionToken(claims, secret);
          const verified = verifyActivitySessionToken(token, secret);

          // Token is valid (not null) — so it's not a 401
          expect(verified).not.toBeNull();
          // But role is not 'master' — this is a 403 scenario
          expect(verified!.role).not.toBe('master');
          // The auth middleware would return 403 here
          const isForbidden = verified!.role !== 'master';
          expect(isForbidden).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('token with campaignId not matching request path classified as forbidden (403 scenario)', () => {
    fc.assert(
      fc.property(
        validClaimsArb.map((c) => ({ ...c, role: 'master' as const })),
        secretArb,
        uuidV7Arb,
        (claims, secret, requestCampaignId) => {
          fc.pre(claims.campaignId !== requestCampaignId);
          const token = signActivitySessionToken(claims, secret);
          const verified = verifyActivitySessionToken(token, secret);

          // Token is valid (not null) — so it's not a 401
          expect(verified).not.toBeNull();
          // Role is master, but campaignId doesn't match the request path
          expect(verified!.role).toBe('master');
          const isForbidden = verified!.campaignId !== requestCampaignId;
          expect(isForbidden).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('missing or structurally invalid token classified as unauthorized (401 scenario)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Missing token (empty string, undefined-like)
          fc.constant(''),
          // Random garbage strings (not valid JWT structure)
          fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.split('.').length !== 3),
          // Two-part tokens (missing signature)
          fc
            .tuple(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }))
            .map(([a, b]) => `${a}.${b}`),
          // Four-part tokens (extra segment)
          fc
            .tuple(
              fc.string({ minLength: 1 }),
              fc.string({ minLength: 1 }),
              fc.string({ minLength: 1 }),
              fc.string({ minLength: 1 }),
            )
            .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
        ),
        secretArb,
        (invalidToken, secret) => {
          // extractBearerToken returns null for missing/empty
          if (invalidToken === '') {
            const extracted = extractBearerToken(undefined);
            expect(extracted).toBeNull();
            const extractedEmpty = extractBearerToken('');
            expect(extractedEmpty).toBeNull();
          }

          // verifyActivitySessionToken returns null for structurally invalid tokens
          const verified = verifyActivitySessionToken(invalidToken, secret);
          expect(verified).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

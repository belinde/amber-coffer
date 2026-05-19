import { createHmac, timingSafeEqual } from 'node:crypto';

export type SessionAuthRole = 'player' | 'master';

export type ActivitySessionTokenClaims = {
  role: SessionAuthRole;
  clientId: string;
  campaignId: string;
  sessionId: string;
  /** Discord user id for players; `master-local` for GM desktop token. */
  sub: string;
  exp: number;
  iat: number;
};

function base64urlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64urlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export function signActivitySessionToken(
  claims: Omit<ActivitySessionTokenClaims, 'iat' | 'exp'> & { ttlSeconds: number },
  secret: string,
): string {
  const iat = Math.floor(Date.now() / 1000);
  const { ttlSeconds, ...identity } = claims;
  const payload: ActivitySessionTokenClaims = {
    ...identity,
    iat,
    exp: iat + ttlSeconds,
  };
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

export function verifyActivitySessionToken(
  token: string,
  secret: string,
): ActivitySessionTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [header, body, signature] = parts as [string, string, string];
  const signingInput = `${header}.${body}`;
  const expected = createHmac('sha256', secret).update(signingInput).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(base64urlDecode(body)) as ActivitySessionTokenClaims;
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (
      (payload.role !== 'player' && payload.role !== 'master') ||
      typeof payload.clientId !== 'string' ||
      typeof payload.campaignId !== 'string' ||
      typeof payload.sessionId !== 'string' ||
      typeof payload.sub !== 'string'
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Bearer token from API Gateway HTTP API v2 event. */
export function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

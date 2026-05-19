import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

import {
  extractBearerToken,
  verifyActivitySessionToken,
  type ActivitySessionTokenClaims,
} from '../../shared/activity-session-token.js';
import {
  etagForVersion,
  jsonResponse,
  parseSinceVersion,
  SYNC_CORS_HEADERS,
} from '../../shared/http-response.js';
import {
  appendPendingEvents,
  getSessionSyncRow,
  putSessionSnapshot,
  rowToStateResponse,
} from '../../shared/session-sync-store.js';

const secrets = new SecretsManagerClient({});

const TABLE_NAME = process.env.SESSION_SYNC_TABLE_NAME ?? '';
const SESSION_AUTH_SECRET_ARN = process.env.SESSION_AUTH_SECRET_ARN ?? '';

let cachedAuthSecret: string | null = null;

async function loadAuthSecret(): Promise<string> {
  if (cachedAuthSecret) {
    return cachedAuthSecret;
  }
  const result = await secrets.send(
    new GetSecretValueCommand({ SecretId: SESSION_AUTH_SECRET_ARN }),
  );
  const value = result.SecretString;
  if (!value) {
    throw new Error('session_auth_secret_empty');
  }
  cachedAuthSecret = value;
  return value;
}

async function authenticate(
  authorization: string | undefined,
): Promise<ActivitySessionTokenClaims | null> {
  const token = extractBearerToken(authorization);
  if (!token) {
    return null;
  }
  const secret = await loadAuthSecret();
  return verifyActivitySessionToken(token, secret);
}

function requireConfigured(): boolean {
  return Boolean(TABLE_NAME && SESSION_AUTH_SECRET_ARN);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const method = event.requestContext.http.method;
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: SYNC_CORS_HEADERS, body: '' };
  }

  if (!requireConfigured()) {
    return jsonResponse(503, { error: 'sync_not_configured' });
  }

  const path = event.rawPath ?? event.requestContext.http.path;

  if (path === '/session/sync/state' && method === 'GET') {
    const claims = await authenticate(event.headers.authorization);
    if (!claims) {
      return jsonResponse(401, { error: 'unauthorized' });
    }

    const row = await getSessionSyncRow(TABLE_NAME, claims.campaignId, claims.sessionId);
    const state = rowToStateResponse(row);
    const sinceVersion = parseSinceVersion(
      event.queryStringParameters,
      event.headers['if-none-match'],
    );
    if (sinceVersion !== null && sinceVersion >= state.version) {
      return jsonResponse(304, '', { etag: etagForVersion(state.version) });
    }

    return jsonResponse(200, state, { etag: etagForVersion(state.version) });
  }

  if (path === '/session/sync/snapshot' && method === 'PUT') {
    const claims = await authenticate(event.headers.authorization);
    if (!claims || claims.role !== 'master') {
      return jsonResponse(403, { error: 'master_role_required' });
    }

    let body: { campaignId?: string; sessionId?: string; snapshot?: unknown };
    try {
      body = JSON.parse(event.body ?? '{}') as typeof body;
    } catch {
      return jsonResponse(400, { error: 'invalid_json' });
    }

    if (
      body.campaignId !== claims.campaignId ||
      body.sessionId !== claims.sessionId ||
      !body.snapshot
    ) {
      return jsonResponse(400, { error: 'invalid_snapshot_body' });
    }

    const row = await putSessionSnapshot({
      tableName: TABLE_NAME,
      campaignId: claims.campaignId,
      sessionId: claims.sessionId,
      snapshot: body.snapshot,
    });

    return jsonResponse(200, rowToStateResponse(row), { etag: etagForVersion(row.version) });
  }

  if (path === '/session/sync/events' && method === 'POST') {
    const claims = await authenticate(event.headers.authorization);
    if (!claims || claims.role !== 'player') {
      return jsonResponse(403, { error: 'player_role_required' });
    }

    let body: { events?: unknown[] };
    try {
      body = JSON.parse(event.body ?? '{}') as typeof body;
    } catch {
      return jsonResponse(400, { error: 'invalid_json' });
    }

    if (!Array.isArray(body.events) || body.events.length === 0) {
      return jsonResponse(400, { error: 'missing_events' });
    }

    const row = await appendPendingEvents({
      tableName: TABLE_NAME,
      campaignId: claims.campaignId,
      sessionId: claims.sessionId,
      events: body.events,
    });

    return jsonResponse(200, { ok: true, version: row.version });
  }

  return jsonResponse(404, { error: 'not_found' });
};

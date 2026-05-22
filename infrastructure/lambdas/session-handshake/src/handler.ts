import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

import {
  extractBearerToken,
  signActivitySessionToken,
  verifyActivitySessionToken,
} from '../../shared/activity-session-token.js';
import { upsertHandshakeChannelMapping } from '../../shared/handshake-channel-store.js';
import { jsonResponse, SYNC_CORS_HEADERS } from '../../shared/http-response.js';

const dynamo = new DynamoDBClient({});
const secrets = new SecretsManagerClient({});

const TABLE_NAME = process.env.HANDSHAKE_TABLE_NAME ?? '';
const SESSION_AUTH_SECRET_ARN = process.env.SESSION_AUTH_SECRET_ARN ?? '';
const POLL_INTERVAL_MS = Number.parseInt(process.env.POLL_INTERVAL_MS ?? '2000', 10);
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID ?? '';
const DISCORD_CLIENT_SECRET_ARN = process.env.DISCORD_CLIENT_SECRET_ARN ?? '';

type HandshakeRow = {
  channel_id: string;
  campaign_id: string;
  session_id: string;
};

type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
};

type DiscordUser = {
  id: string;
};

async function exchangeDiscordCode(args: {
  code: string;
  redirectUri: string;
  clientSecret: string;
}): Promise<string> {
  const params = new URLSearchParams({
    client_id: DISCORD_APPLICATION_ID,
    client_secret: args.clientSecret,
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: args.redirectUri,
  });

  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`discord_token_exchange_failed:${res.status}:${text}`);
  }

  const data = (await res.json()) as DiscordTokenResponse;
  return data.access_token;
}

async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`discord_user_failed:${res.status}:${text}`);
  }

  return (await res.json()) as DiscordUser;
}

async function loadHandshakeRow(channelId: string): Promise<HandshakeRow | null> {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { channel_id: { S: channelId } },
    }),
  );

  if (!result.Item) {
    return null;
  }

  const row = unmarshall(result.Item) as HandshakeRow;
  if (!row.campaign_id || !row.session_id) {
    return null;
  }
  return row;
}

let cachedAuthSecret: string | null = null;

async function loadSessionAuthSecret(): Promise<string> {
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

async function handlePlayerHandshake(event: Parameters<APIGatewayProxyHandlerV2>[0]) {
  if (!DISCORD_CLIENT_SECRET_ARN) {
    return jsonResponse(503, { error: 'handshake_not_configured' });
  }

  let body: { code?: string; channelId?: string; redirectUri?: string };
  try {
    body = JSON.parse(event.body ?? '{}') as typeof body;
  } catch {
    return jsonResponse(400, { error: 'invalid_json' });
  }

  const { code, channelId, redirectUri } = body;
  if (!code || !channelId || !redirectUri) {
    return jsonResponse(400, {
      error: 'missing_fields',
      message: 'code, channelId, redirectUri required',
    });
  }

  try {
    const secretResult = await secrets.send(
      new GetSecretValueCommand({ SecretId: DISCORD_CLIENT_SECRET_ARN }),
    );
    const clientSecret = secretResult.SecretString;
    if (!clientSecret || clientSecret === 'REPLACE_ME') {
      return jsonResponse(503, { error: 'discord_client_secret_not_configured' });
    }

    const accessToken = await exchangeDiscordCode({ code, redirectUri, clientSecret });
    const user = await fetchDiscordUser(accessToken);
    const row = await loadHandshakeRow(channelId);
    if (!row) {
      return jsonResponse(404, {
        error: 'channel_not_linked',
        message: 'No campaign mapped to this voice channel',
      });
    }

    const clientId = `player-${user.id}`;
    const authSecret = await loadSessionAuthSecret();
    const sessionToken = signActivitySessionToken(
      {
        role: 'player',
        clientId,
        campaignId: row.campaign_id,
        sessionId: row.session_id,
        sub: user.id,
        ttlSeconds: 3600,
      },
      authSecret,
    );

    return jsonResponse(200, {
      campaignId: row.campaign_id,
      sessionId: row.session_id,
      playerDiscordId: user.id,
      sync: {
        sessionToken,
        pollIntervalMs: Number.isFinite(POLL_INTERVAL_MS) ? POLL_INTERVAL_MS : 2000,
      },
    });
  } catch (err) {
    console.error('handshake_failed', err);
    const message = err instanceof Error ? err.message : 'unknown_error';
    if (message.startsWith('discord_')) {
      return jsonResponse(401, { error: 'discord_auth_failed', message });
    }
    return jsonResponse(500, { error: 'handshake_failed', message });
  }
}

async function handleMasterChannelLink(event: Parameters<APIGatewayProxyHandlerV2>[0]) {
  const bearer = extractBearerToken(event.headers?.authorization);
  if (!bearer) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  let body: { channelId?: string };
  try {
    body = JSON.parse(event.body ?? '{}') as typeof body;
  } catch {
    return jsonResponse(400, { error: 'invalid_json' });
  }

  const { channelId } = body;
  if (!channelId) {
    return jsonResponse(400, { error: 'missing_fields', message: 'channelId required' });
  }

  try {
    const authSecret = await loadSessionAuthSecret();
    const claims = verifyActivitySessionToken(bearer, authSecret);
    if (!claims || claims.role !== 'master') {
      return jsonResponse(401, { error: 'unauthorized' });
    }

    await upsertHandshakeChannelMapping({
      tableName: TABLE_NAME,
      channelId,
      campaignId: claims.campaignId,
      sessionId: claims.sessionId,
    });

    return jsonResponse(200, {
      campaignId: claims.campaignId,
      sessionId: claims.sessionId,
      channelId,
    });
  } catch (err) {
    console.error('handshake_channel_link_failed', err);
    const message = err instanceof Error ? err.message : 'unknown_error';
    return jsonResponse(500, { error: 'handshake_channel_link_failed', message });
  }
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: SYNC_CORS_HEADERS, body: '' };
  }

  if (!TABLE_NAME || !SESSION_AUTH_SECRET_ARN || !DISCORD_APPLICATION_ID) {
    return jsonResponse(503, { error: 'handshake_not_configured' });
  }

  const path = event.rawPath ?? event.requestContext.http.path;
  const method = event.requestContext.http.method;

  if (path === '/session/handshake/channel' && method === 'PUT') {
    return handleMasterChannelLink(event);
  }

  if (path === '/session/handshake' && method === 'POST') {
    return handlePlayerHandshake(event);
  }

  return jsonResponse(404, { error: 'not_found' });
};

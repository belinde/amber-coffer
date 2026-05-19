import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

import { signActivitySessionToken } from '../../shared/activity-session-token.js';

const dynamo = new DynamoDBClient({});
const secrets = new SecretsManagerClient({});

const TABLE_NAME = process.env.HANDSHAKE_TABLE_NAME ?? '';
const SESSION_AUTH_SECRET_ARN = process.env.SESSION_AUTH_SECRET_ARN ?? '';
const POLL_INTERVAL_MS = Number.parseInt(process.env.POLL_INTERVAL_MS ?? '2000', 10);
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID ?? '';
const DISCORD_CLIENT_SECRET_ARN = process.env.DISCORD_CLIENT_SECRET_ARN ?? '';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'POST, OPTIONS',
  'content-type': 'application/json',
};

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

function json(
  statusCode: number,
  body: unknown,
): { statusCode: number; headers: typeof CORS_HEADERS; body: string } {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

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

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.requestContext.http.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const path = event.rawPath ?? event.requestContext.http.path;
  if (path !== '/session/handshake') {
    return json(404, { error: 'not_found' });
  }

  if (
    !TABLE_NAME ||
    !SESSION_AUTH_SECRET_ARN ||
    !DISCORD_APPLICATION_ID ||
    !DISCORD_CLIENT_SECRET_ARN
  ) {
    return json(503, { error: 'handshake_not_configured' });
  }

  let body: { code?: string; channelId?: string; redirectUri?: string };
  try {
    body = JSON.parse(event.body ?? '{}') as typeof body;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const { code, channelId, redirectUri } = body;
  if (!code || !channelId || !redirectUri) {
    return json(400, { error: 'missing_fields', message: 'code, channelId, redirectUri required' });
  }

  try {
    const secretResult = await secrets.send(
      new GetSecretValueCommand({ SecretId: DISCORD_CLIENT_SECRET_ARN }),
    );
    const clientSecret = secretResult.SecretString;
    if (!clientSecret || clientSecret === 'REPLACE_ME') {
      return json(503, { error: 'discord_client_secret_not_configured' });
    }

    const accessToken = await exchangeDiscordCode({ code, redirectUri, clientSecret });
    const user = await fetchDiscordUser(accessToken);
    const row = await loadHandshakeRow(channelId);
    if (!row) {
      return json(404, {
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

    return json(200, {
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
      return json(401, { error: 'discord_auth_failed', message });
    }
    return json(500, { error: 'handshake_failed', message });
  }
};

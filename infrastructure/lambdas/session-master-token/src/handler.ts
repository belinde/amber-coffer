import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

import { signActivitySessionToken } from '../../shared/activity-session-token.js';
import { jsonResponse, SYNC_CORS_HEADERS } from '../../shared/http-response.js';

const secrets = new SecretsManagerClient({});

const SESSION_AUTH_SECRET_ARN = process.env.SESSION_AUTH_SECRET_ARN ?? '';
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID ?? '';
const POLL_INTERVAL_MS = process.env.POLL_INTERVAL_MS ?? '2000';

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

type DiscordUser = { id: string };

async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`discord_user_failed:${res.status}:${body.slice(0, 200)}`);
  }
  return (await res.json()) as DiscordUser;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: SYNC_CORS_HEADERS, body: '' };
  }

  if (event.requestContext.http.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  const path = event.rawPath ?? event.requestContext.http.path;
  if (path !== '/session/master/token') {
    return jsonResponse(404, { error: 'not_found' });
  }

  if (!SESSION_AUTH_SECRET_ARN || !DISCORD_APPLICATION_ID) {
    return jsonResponse(503, { error: 'master_token_not_configured' });
  }

  let body: { campaignId?: string; sessionId?: string; discordAccessToken?: string };
  try {
    body = JSON.parse(event.body ?? '{}') as typeof body;
  } catch {
    return jsonResponse(400, { error: 'invalid_json' });
  }

  const { campaignId, sessionId, discordAccessToken: rawDiscordToken } = body;
  const discordAccessToken = rawDiscordToken?.trim();
  if (!campaignId || !sessionId || !discordAccessToken) {
    return jsonResponse(400, { error: 'missing_fields' });
  }

  try {
    const authSecret = await loadAuthSecret();
    const discordUser = await fetchDiscordUser(discordAccessToken);
    const clientId = `master-${discordUser.id}`;
    const sessionToken = signActivitySessionToken(
      {
        role: 'master',
        clientId,
        campaignId,
        sessionId,
        sub: discordUser.id,
        ttlSeconds: 8 * 3600,
      },
      authSecret,
    );

    return jsonResponse(200, {
      sessionToken,
      pollIntervalMs: Number.parseInt(POLL_INTERVAL_MS, 10) || 2000,
      campaignId,
      sessionId,
    });
  } catch (err) {
    console.error('master_token_failed', err);
    const message = err instanceof Error ? err.message : 'unknown_error';
    if (message.includes('session_auth_secret')) {
      return jsonResponse(503, { error: 'master_token_not_configured', message });
    }
    if (message.startsWith('discord_user_failed')) {
      return jsonResponse(401, { error: 'discord_auth_failed', message });
    }
    return jsonResponse(500, { error: 'master_token_failed', message });
  }
};

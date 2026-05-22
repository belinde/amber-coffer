import {
  sessionHandshakeChannelLinkRequestSchema,
  sessionHandshakeChannelLinkResponseSchema,
  sessionMasterTokenRequestSchema,
  sessionMasterTokenResponseSchema,
  sessionSyncApiErrorSchema,
  sessionSyncSnapshotPutSchema,
  sessionSyncStateResponseSchema,
  tabletopSnapshotSchema,
  type Campaign,
  type MqttMessage,
  type SessionSyncStateResponse,
} from '@amber/shared';

export class MasterSessionTokenError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'MasterSessionTokenError';
    this.status = status;
    this.code = code;
  }
}

export function getSyncApiBaseUrl(): string {
  const url: unknown = import.meta.env.VITE_AMBER_SYNC_API_BASE_URL;
  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new Error('VITE_AMBER_SYNC_API_BASE_URL not configured');
  }
  return url.replace(/\/$/, '');
}

export async function fetchMasterSessionToken(args: {
  campaignId: Campaign['id'];
  sessionId: string;
  discordAccessToken: string;
  channelId?: string | undefined;
}): Promise<{
  sessionToken: string;
  pollIntervalMs: number;
  handshakeChannelLinked?: boolean | undefined;
}> {
  const body = sessionMasterTokenRequestSchema.parse({
    campaignId: args.campaignId,
    sessionId: args.sessionId,
    discordAccessToken: args.discordAccessToken,
    channelId: args.channelId,
  });

  const res = await fetch(`${getSyncApiBaseUrl()}/session/master/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const parsed = sessionSyncApiErrorSchema.safeParse(json);
    const code = parsed.success ? parsed.data.error : 'master_token_failed';
    const message = parsed.success ? parsed.data.message : undefined;
    throw new MasterSessionTokenError(res.status, code, message);
  }

  const parsed = sessionMasterTokenResponseSchema.parse(json);
  return {
    sessionToken: parsed.sessionToken,
    pollIntervalMs: parsed.pollIntervalMs,
    handshakeChannelLinked: parsed.handshakeChannelLinked,
  };
}

/** Point Player Activity handshake at the master's current live session for this voice channel. */
export async function registerHandshakeChannel(args: {
  sessionToken: string;
  channelId: string;
}): Promise<void> {
  const body = sessionHandshakeChannelLinkRequestSchema.parse({
    channelId: args.channelId,
  });

  const res = await fetch(`${getSyncApiBaseUrl()}/session/handshake/channel`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.sessionToken}`,
    },
    body: JSON.stringify(body),
  });

  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const parsed = sessionSyncApiErrorSchema.safeParse(json);
    const code = parsed.success ? parsed.data.error : 'handshake_channel_link_failed';
    const message = parsed.success ? parsed.data.message : undefined;
    throw new MasterSessionTokenError(res.status, code, message);
  }

  sessionHandshakeChannelLinkResponseSchema.parse(json);
}

export async function putSessionSnapshot(args: {
  sessionToken: string;
  campaignId: Campaign['id'];
  sessionId: string;
  snapshot: unknown;
}): Promise<void> {
  const snapshot = tabletopSnapshotSchema.parse(args.snapshot);
  const body = sessionSyncSnapshotPutSchema.parse({
    campaignId: args.campaignId,
    sessionId: args.sessionId,
    snapshot,
  });

  const res = await fetch(`${getSyncApiBaseUrl()}/session/sync/snapshot`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.sessionToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`put_snapshot_failed:${res.status}`);
  }
}

export async function getSessionSyncState(args: {
  sessionToken: string;
  sinceVersion?: number;
}): Promise<{ status: 200; state: SessionSyncStateResponse } | { status: 304 }> {
  let path = `${getSyncApiBaseUrl()}/session/sync/state`;
  if (args.sinceVersion !== undefined) {
    path += `?sinceVersion=${encodeURIComponent(String(args.sinceVersion))}`;
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${args.sessionToken}`,
  };
  if (args.sinceVersion !== undefined) {
    headers['if-none-match'] = `W/"${args.sinceVersion}"`;
  }

  const res = await fetch(path, { method: 'GET', headers });
  if (res.status === 304) {
    return { status: 304 };
  }

  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`get_sync_state_failed:${res.status}`);
  }

  return { status: 200, state: sessionSyncStateResponseSchema.parse(json) };
}

export function isPlayerMoveRequest(
  event: MqttMessage,
): event is Extract<MqttMessage, { kind: 'token.move.request' }> {
  return event.kind === 'token.move.request';
}

/** User-facing message for sync poll errors (master-app). */
export function formatMasterSyncPollError(err: unknown): string {
  if (err instanceof MasterSessionTokenError) {
    if (err.code === 'discord_auth_failed') {
      return 'sessionSync.errors.discordAuthFailed';
    }
    if (err.code === 'master_token_not_configured') {
      return 'sessionSync.errors.apiNotConfigured';
    }
    return 'sessionSync.errors.tokenFailed';
  }
  if (err instanceof Error) {
    if (err.message.includes('VITE_AMBER_SYNC_API_BASE_URL')) {
      return 'sessionSync.errors.apiUrlMissing';
    }
    return err.message;
  }
  return String(err);
}

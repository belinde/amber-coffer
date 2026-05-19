import {
  sessionSyncEventsPostSchema,
  sessionSyncStateResponseSchema,
  type MqttMessage,
  type SessionSyncStateResponse,
} from '@amber/shared';

import { getApiBaseUrl, type ApiUrlOptions } from '../config/api.js';

export class SessionSyncError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'SessionSyncError';
    this.status = status;
    this.code = code;
  }
}

export async function getSessionSyncState(
  sessionToken: string,
  options?: ApiUrlOptions & { sinceVersion?: number },
): Promise<{ status: 200; state: SessionSyncStateResponse } | { status: 304 }> {
  const baseUrl = getApiBaseUrl(options);
  if (!baseUrl) {
    throw new SessionSyncError(0, 'api_not_configured');
  }

  let path = `${baseUrl}/session/sync/state`;
  if (options?.sinceVersion !== undefined) {
    path += `?sinceVersion=${encodeURIComponent(String(options.sinceVersion))}`;
  }

  const headers: Record<string, string> = {
    authorization: `Bearer ${sessionToken}`,
  };
  if (options?.sinceVersion !== undefined) {
    headers['if-none-match'] = `W/"${options.sinceVersion}"`;
  }

  const res = await fetch(path, { method: 'GET', headers });

  if (res.status === 304) {
    return { status: 304 };
  }

  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code =
      typeof json === 'object' && json !== null && 'error' in json
        ? String((json as { error: string }).error)
        : 'sync_state_failed';
    throw new SessionSyncError(res.status, code);
  }

  return { status: 200, state: sessionSyncStateResponseSchema.parse(json) };
}

export async function postSessionSyncEvents(
  sessionToken: string,
  events: MqttMessage[],
  options?: ApiUrlOptions,
): Promise<void> {
  const baseUrl = getApiBaseUrl(options);
  if (!baseUrl) {
    throw new SessionSyncError(0, 'api_not_configured');
  }

  const body = sessionSyncEventsPostSchema.parse({ events });
  const res = await fetch(`${baseUrl}/session/sync/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const json: unknown = await res.json().catch(() => ({}));
    const code =
      typeof json === 'object' && json !== null && 'error' in json
        ? String((json as { error: string }).error)
        : 'sync_events_failed';
    throw new SessionSyncError(res.status, code);
  }
}

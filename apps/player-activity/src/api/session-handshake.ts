import {
  sessionHandshakeErrorSchema,
  sessionHandshakeResponseSchema,
  type SessionHandshakeRequest,
  type SessionHandshakeResponse,
} from '@amber/shared';

import { getApiBaseUrl, type ApiUrlOptions } from '../config/api.js';

export class SessionHandshakeError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'SessionHandshakeError';
    this.status = status;
    this.code = code;
  }
}

export async function postSessionHandshake(
  body: SessionHandshakeRequest,
  options?: ApiUrlOptions,
): Promise<SessionHandshakeResponse> {
  const baseUrl = getApiBaseUrl(options);
  if (!baseUrl) {
    throw new SessionHandshakeError(0, 'api_not_configured');
  }

  const res = await fetch(`${baseUrl}/session/handshake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const parsed = sessionHandshakeErrorSchema.safeParse(json);
    const code = parsed.success ? parsed.data.error : 'handshake_failed';
    const message = parsed.success ? parsed.data.message : undefined;
    throw new SessionHandshakeError(res.status, code, message);
  }

  return sessionHandshakeResponseSchema.parse(json);
}

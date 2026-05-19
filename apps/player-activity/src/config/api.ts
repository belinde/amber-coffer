export type ApiUrlOptions = {
  /** When true, use Discord Activity proxy prefix (e.g. `/api`). */
  useDiscordProxy?: boolean;
};

export type ActivityRedirectOptions = {
  embedded?: boolean;
};

function trimEnv(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Hostname for portal mapping `/api` → target (no protocol). */
export function getApiProxyTarget(): string | null {
  return trimEnv(import.meta.env.VITE_API_PROXY_TARGET);
}

/** Discord proxy path prefix for HTTP API (default `/api` when proxy target is set). */
export function getApiProxyPrefix(): string | null {
  const configured = trimEnv(import.meta.env.VITE_API_PROXY_PREFIX);
  if (configured) {
    const normalized = configured.startsWith('/') ? configured : `/${configured}`;
    return normalized.replace(/\/$/, '') || '/api';
  }
  if (getApiProxyTarget()) {
    return '/api';
  }
  return null;
}

/** Absolute API base URL for standalone dev without Discord proxy. */
export function getApiDirectBaseUrl(): string | null {
  const direct =
    trimEnv(import.meta.env.VITE_API_DIRECT_BASE_URL) ?? trimEnv(import.meta.env.VITE_API_BASE_URL);
  return direct?.replace(/\/$/, '') ?? null;
}

/**
 * Base URL for session handshake.
 * - Discord iframe: relative proxy prefix (`/api`)
 * - Standalone / URL override: absolute API URL
 */
export function getApiBaseUrl(options?: ApiUrlOptions): string | null {
  if (options?.useDiscordProxy) {
    return getApiProxyPrefix();
  }
  return getApiDirectBaseUrl();
}

/**
 * OAuth redirect URI for handshake code exchange.
 * In the Activity iframe, `window.location.origin` (`*.discordsays.com`) must match a portal redirect.
 */
export function getActivityRedirectUri(options?: ActivityRedirectOptions): string {
  if (options?.embedded && typeof window !== 'undefined') {
    return window.location.origin;
  }
  const configured = trimEnv(import.meta.env.VITE_DISCORD_REDIRECT_URI);
  if (configured) {
    return configured;
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

export function isAwsHandshakeEnabled(): boolean {
  return getApiProxyPrefix() !== null || getApiDirectBaseUrl() !== null;
}

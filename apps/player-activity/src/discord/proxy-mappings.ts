import { patchUrlMappings } from '@discord/embedded-app-sdk';

import { getApiProxyPrefix, getApiProxyTarget } from '../config/api.js';

type UrlMapping = {
  prefix: string;
  target: string;
};

export type DiscordProxyMappingOptions = {
  readonly patchFetch?: boolean;
  readonly patchWebSocket?: boolean;
  readonly patchXhr?: boolean;
};

function buildApiMapping(): UrlMapping | null {
  const prefix = getApiProxyPrefix();
  const target = getApiProxyTarget();
  if (!prefix || !target) {
    return null;
  }
  return { prefix, target };
}

/** Patches Discord Embedded App SDK to route `/api` through the Activity proxy. */
export function setupDiscordApiProxyMappings(options?: DiscordProxyMappingOptions): void {
  const apiMapping = buildApiMapping();
  if (!apiMapping) {
    return;
  }
  patchUrlMappings([apiMapping], {
    patchFetch: options?.patchFetch ?? true,
    patchWebSocket: options?.patchWebSocket ?? false,
    patchXhr: options?.patchXhr ?? true,
  });
}

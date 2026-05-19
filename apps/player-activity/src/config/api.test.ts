import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('api config', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns proxy prefix when useDiscordProxy is true', async () => {
    vi.stubEnv('VITE_API_PROXY_PREFIX', '/api');
    vi.stubEnv('VITE_API_PROXY_TARGET', 'api.ambercoffer.belinde.click');
    const { getApiBaseUrl } = await import('./api.js');
    expect(getApiBaseUrl({ useDiscordProxy: true })).toBe('/api');
  });

  it('returns direct URL when useDiscordProxy is false', async () => {
    vi.stubEnv('VITE_API_DIRECT_BASE_URL', 'https://api.ambercoffer.belinde.click');
    const { getApiBaseUrl } = await import('./api.js');
    expect(getApiBaseUrl({ useDiscordProxy: false })).toBe('https://api.ambercoffer.belinde.click');
  });

  it('falls back to legacy VITE_API_BASE_URL for direct mode', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/');
    const { getApiBaseUrl } = await import('./api.js');
    expect(getApiBaseUrl()).toBe('https://api.example.test');
  });

  it('uses window origin for redirect when embedded', async () => {
    vi.stubEnv('VITE_DISCORD_REDIRECT_URI', 'https://table.example.test');
    vi.stubGlobal('window', {
      location: { origin: 'https://1505870393007935598.discordsays.com' },
    });
    const { getActivityRedirectUri } = await import('./api.js');
    expect(getActivityRedirectUri({ embedded: true })).toBe(
      'https://1505870393007935598.discordsays.com',
    );
  });

  it('uses configured redirect when not embedded', async () => {
    vi.stubEnv('VITE_DISCORD_REDIRECT_URI', 'https://table.example.test');
    const { getActivityRedirectUri } = await import('./api.js');
    expect(getActivityRedirectUri({ embedded: false })).toBe('https://table.example.test');
  });

  it('enables handshake when proxy or direct is configured', async () => {
    vi.stubEnv('VITE_API_PROXY_TARGET', 'api.ambercoffer.belinde.click');
    const { isAwsHandshakeEnabled } = await import('./api.js');
    expect(isAwsHandshakeEnabled()).toBe(true);
  });
});

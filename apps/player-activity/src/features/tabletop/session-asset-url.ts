/**
 * Resolves a session asset path for use in the Discord Activity iframe.
 * Relative paths (e.g. `/session-assets/...`) are served via the `/` URL mapping proxy.
 */
export function sessionAssetUrl(publicPath: string | null | undefined): string | null {
  const trimmed = publicPath?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

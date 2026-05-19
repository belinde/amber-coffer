export const SYNC_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization, if-none-match',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'content-type': 'application/json',
};

export function jsonResponse(
  statusCode: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): {
  statusCode: number;
  headers: typeof SYNC_CORS_HEADERS & Record<string, string>;
  body: string;
} {
  const serialized =
    body === '' || body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return {
    statusCode,
    headers: { ...SYNC_CORS_HEADERS, ...extraHeaders },
    body: serialized,
  };
}

export function etagForVersion(version: number): string {
  return `W/"${version}"`;
}

export function parseSinceVersion(
  queryParams: Record<string, string | undefined> | undefined,
  ifNoneMatch: string | undefined,
): number | null {
  const raw = queryParams?.sinceVersion;
  if (raw !== undefined) {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (ifNoneMatch) {
    const match = /^W\/"(\d+)"$/.exec(ifNoneMatch.trim());
    if (match) {
      return Number.parseInt(match[1] ?? '0', 10);
    }
  }
  return null;
}

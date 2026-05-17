/** Joins non-empty parts with a middle dot. */
export function compactJoin(parts: Array<string | null | undefined>, separator = ' · '): string | undefined {
  const filtered = parts.map((p) => p?.trim()).filter((p): p is string => Boolean(p));
  return filtered.length > 0 ? filtered.join(separator) : undefined;
}

/** Truncates long text for list previews. */
export function truncatePreview(text: string | null | undefined, maxLen = 72): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

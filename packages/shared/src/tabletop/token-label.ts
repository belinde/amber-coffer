/**
 * Short literal label for a tabletop token (no portrait image).
 */
export function tokenLiteralLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const fromWords = words
      .slice(0, 3)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
    if (fromWords.length >= 2) {
      return fromWords.slice(0, 3);
    }
  }
  const alnum = trimmed.replace(/[^\p{L}\p{N}]/gu, '');
  if (alnum.length >= 2) {
    return alnum.slice(0, 2).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase() || '?';
}

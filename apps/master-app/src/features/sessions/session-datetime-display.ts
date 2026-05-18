export function formatSessionDateTime(ms: number, locale?: string): string {
  return new Date(ms).toLocaleString(locale);
}

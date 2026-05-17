import type { CampaignSubjectOption } from './types.js';

/** Case-insensitive substring match on subject label. */
export function filterSubjectsByQuery(
  options: CampaignSubjectOption[],
  query: string,
): CampaignSubjectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => o.label.toLowerCase().includes(q));
}

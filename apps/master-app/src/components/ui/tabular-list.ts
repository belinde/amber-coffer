import type { ImageRef } from '@amber/shared';

/** Row payload for tabular / scan-friendly lists. */
export type TabularListRow = {
  title: string;
  subtitle?: string;
  /** Extra columns or chips (status, tags, owner, …). */
  details?: string[];
  image?: ImageRef | null;
  /** Short badge (e.g. visibility) shown near the title. */
  badge?: string;
};

export type TabularListEntry = {
  id: string;
  row: TabularListRow;
};

/** Builds a row without assigning `undefined` to optional keys (exactOptionalPropertyTypes). */
export function buildTabularRow(parts: {
  title: string;
  subtitle?: string | undefined;
  details?: string[] | undefined;
  image?: ImageRef | null | undefined;
  badge?: string | undefined;
}): TabularListRow {
  const row: TabularListRow = { title: parts.title };
  if (parts.subtitle) row.subtitle = parts.subtitle;
  if (parts.details && parts.details.length > 0) row.details = parts.details;
  if (parts.image != null) row.image = parts.image;
  if (parts.badge) row.badge = parts.badge;
  return row;
}

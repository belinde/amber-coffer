import type { EntityRegistry } from './registry.js';

/** Extra recap labels → entity slug (registered after canonical entities are loaded). */
const ALIASES_BY_SLUG: Record<string, readonly string[]> = {
  'todd-crow': ['secondo fratello crow', 'secondo dei fratelli crow'],
  'silas-drummond': ['lo sceriffo di valdoren', 'sceriffo di valdoren'],
  'ben-campbell': [
    'il mississippi',
    'mississippi',
    'grande fiume',
    'corridoio delle cabine di lusso',
    'corridoio cabine di lusso',
  ],
  'fattoria-mercer': ['fattoria isolata'],
};

export function registerEntityAliases(registry: EntityRegistry): void {
  for (const [slug, aliases] of Object.entries(ALIASES_BY_SLUG)) {
    const entry = registry.getBySlug(slug);
    if (!entry) continue;
    for (const alias of aliases) {
      registry.registerAlias(alias, entry.id);
    }
  }
}

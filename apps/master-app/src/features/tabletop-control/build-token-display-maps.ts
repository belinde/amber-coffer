import { tokenLiteralLabel, type Character, type Npc, type Token } from '@amber/shared';

export function buildTokenDisplayMaps(
  tokens: Token[],
  characters: Character[],
  npcs: Npc[],
): { labels: Record<string, string>; names: Record<string, string> } {
  const charNames = new Map(characters.map((c) => [c.id, c.name]));
  const npcNames = new Map(npcs.map((n) => [n.id, n.name]));
  const labels: Record<string, string> = {};
  const names: Record<string, string> = {};

  for (const token of tokens) {
    const name =
      token.entityKind === 'custom'
        ? token.displayName?.trim()
        : token.entityKind === 'character'
          ? charNames.get(token.entityId as Character['id'])
          : token.entityKind === 'npc'
            ? npcNames.get(token.entityId as Npc['id'])
            : undefined;
    if (!name) {
      continue;
    }
    labels[token.id] = tokenLiteralLabel(name);
    names[token.id] = name;
  }

  return { labels, names };
}

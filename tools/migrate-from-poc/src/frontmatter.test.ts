import { describe, expect, it } from 'vitest';

import {
  parseBulletNames,
  parseBulletRefs,
  parseEventiInteressanti,
  parseGameStats,
  parseImageMarkdown,
  parseItalianDate,
  parseMarkdown,
} from './frontmatter.js';
import { EntityRegistry } from './registry.js';
import { registerEntityAliases } from './entity-aliases.js';
import { slugify } from './slug.js';

describe('parseMarkdown', () => {
  it('parses title, metadata, and sections', () => {
    const raw = `# Test NPC

**Regione:** North

## Aspetto

Tall.

## Note DM

Secret.
`;
    const parsed = parseMarkdown(raw);
    expect(parsed.title).toBe('Test NPC');
    expect(parsed.metadata.Regione).toBe('North');
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0]?.heading).toBe('Aspetto');
  });
});

describe('parse utilities', () => {
  it('parses image markdown', () => {
    const img = parseImageMarkdown('![Alt](/immagini/png/x.jpg)');
    expect(img?.path).toBe('/immagini/png/x.jpg');
  });

  it('parses session events', () => {
    const events = parseEventiInteressanti(
      '- **[Sessione 003]** Did something important.',
    );
    expect(events).toEqual([{ sessionNumber: 3, summary: 'Did something important.' }]);
  });

  it('parses game stats', () => {
    const stats = parseGameStats('**AC:** 15\n**HP:** 22');
    expect(stats.AC).toBe('15');
  });

  it('parses bullet names', () => {
    const names = parseBulletNames('- **New Avalon** — capital\n- **River**');
    expect(names).toEqual(['New Avalon', 'River']);
  });

  it('parses bullet refs with alternate italic names and anonymous markers', () => {
    const refs = parseBulletRefs(
      '- **Lo sceriffo di Valdoren** *Silas Drummond* — taglia\n- **Halfling** (anonimo) — ladro',
    );
    expect(refs[0]?.primary).toBe('Lo sceriffo di Valdoren');
    expect(refs[0]?.alternateNames).toEqual(['Silas Drummond']);
    expect(refs[1]?.anonymous).toBe(true);
  });

  it('parses italian date metadata', () => {
    expect(parseItalianDate({ Data: '10/03/2026' })).toBe(Date.UTC(2026, 2, 10));
  });

  it('slugifies titles', () => {
    expect(slugify("Dora l'Esploratrice")).toBe('dora-l-esploratrice');
  });
});

describe('entity aliases', () => {
  it('resolves session recap labels', () => {
    const registry = new EntityRegistry();
    registry.register({
      kind: 'npc',
      id: 'npc-todd',
      name: 'Todd Crow',
      slug: 'todd-crow',
    });
    registerEntityAliases(registry);
    expect(registry.resolveNpcName('Secondo fratello Crow')).toBe('npc-todd');
  });
});

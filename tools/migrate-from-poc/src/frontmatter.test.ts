import { describe, expect, it } from 'vitest';

import { registerEntityAliases } from './entity-aliases.js';
import {
  parseBulletNames,
  parseBulletRefs,
  parseEventiInteressanti,
  parseGameStats,
  parseImageMarkdown,
  parseItalianDate,
  parseMarkdown,
} from './frontmatter.js';
import { parseNotableEquipment } from './mapping/common.js';
import { EntityRegistry } from './registry.js';
import { resolveSessionEncounterIds } from './session-resolve.js';
import { slugify } from './slug.js';
import type { ExtractContext } from './types.js';

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
    const events = parseEventiInteressanti('- **[Sessione 003]** Did something important.');
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

  it('does not resolve location-only aliases as NPCs', () => {
    const registry = new EntityRegistry();
    registry.register({
      kind: 'location',
      id: 'loc-ben',
      name: 'Ben Campbell',
      slug: 'ben-campbell',
    });
    registerEntityAliases(registry);
    expect(registry.resolveLocationName('Il Mississippi')).toBe('loc-ben');
    expect(registry.resolveNpcName('Il Mississippi')).toBeUndefined();
  });
});

describe('parseNotableEquipment', () => {
  it('parses equipment bullets', () => {
    const parsed = parseMarkdown(`# PG

## Equipaggiamento notevole

- **Mulo** *Svalka* — pack animal
`);
    expect(parseNotableEquipment(parsed)).toEqual(['Mulo Svalka']);
  });
});

function minimalCtx(registry: EntityRegistry): ExtractContext {
  return {
    rootPath: '/tmp',
    campaignId: 'camp-1',
    strict: false,
    warnings: [],
    errors: [],
    registry,
    mapping: { version: 1, campaignId: 'camp-1', files: {} },
    assets: [],
    portraitCampaignImages: [],
    portraitBindings: [],
    fileCount: 0,
  };
}

describe('session encounter resolution', () => {
  it('session 001: Mississippi in locations, Ben Campbell steamboat not in NPCs', () => {
    const registry = new EntityRegistry();
    registry.register({
      kind: 'location',
      id: 'loc-avalon',
      name: 'New Avalon',
      slug: 'new-avalon',
    });
    registry.register({
      kind: 'location',
      id: 'loc-ben',
      name: 'Ben Campbell',
      slug: 'ben-campbell',
    });
    registerEntityAliases(registry);

    const ctx = minimalCtx(registry);
    const encounters = resolveSessionEncounterIds(
      ctx,
      'resoconti/sessione-001.md',
      '- **New Avalon** — capital\n- **Il Mississippi** — river',
      '- **Ben Campbell** *(steamboat)* — packet boat',
    );

    expect([...new Set(encounters.locationIds)]).toEqual(['loc-avalon', 'loc-ben']);
    expect(encounters.npcIds).toEqual([]);
    expect(ctx.warnings).toHaveLength(0);
  });

  it('session 002: Todd Crow NPC; anonymous signora skipped', () => {
    const registry = new EntityRegistry();
    registry.register({
      kind: 'npc',
      id: 'npc-sam',
      name: 'Sam Crow',
      slug: 'sam-crow',
    });
    registry.register({
      kind: 'npc',
      id: 'npc-todd',
      name: 'Todd Crow',
      slug: 'todd-crow',
    });
    registry.register({
      kind: 'npc',
      id: 'npc-caldwell',
      name: 'Thomas Caldwell',
      slug: 'thomas-caldwell',
    });
    registerEntityAliases(registry);

    const ctx = minimalCtx(registry);
    const { npcIds } = resolveSessionEncounterIds(
      ctx,
      'resoconti/sessione-002.md',
      '',
      [
        '- **Sam Crow** — outlaw',
        '- **Secondo fratello Crow** *(senza nome)* — dead',
        '- **Thomas Caldwell** — officer',
        '- **La signora delle cabine di lusso** *(senza nome)* — victim',
      ].join('\n'),
    );

    expect(npcIds).toEqual(['npc-sam', 'npc-todd', 'npc-caldwell']);
    expect(ctx.warnings).toHaveLength(0);
  });

  it('session 005: scene-only locations do not warn', () => {
    const registry = new EntityRegistry();
    registry.register({
      kind: 'location',
      id: 'loc-mercer',
      name: 'Fattoria Mercer',
      slug: 'fattoria-mercer',
    });
    registerEntityAliases(registry);

    const ctx = minimalCtx(registry);
    const { locationIds } = resolveSessionEncounterIds(
      ctx,
      'resoconti/sessione-005.md',
      '- **Strada e sosta di mezzogiorno** — pause\n- **Fattoria isolata** — farm',
      '',
    );

    expect(locationIds).toEqual(['loc-mercer']);
    expect(ctx.warnings).toHaveLength(0);
  });
});

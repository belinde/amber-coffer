import { describe, expect, it } from 'vitest';

import { filterSubjectsByQuery } from './filter-subjects.js';

describe('filterSubjectsByQuery', () => {
  const options = [
    { kind: 'npc', id: '1', label: 'Aldric' },
    { kind: 'npc', id: '2', label: 'Bruna' },
  ];

  it('returns all options when query is empty', () => {
    expect(filterSubjectsByQuery(options, '')).toEqual(options);
    expect(filterSubjectsByQuery(options, '   ')).toEqual(options);
  });

  it('filters case-insensitively by label substring', () => {
    expect(filterSubjectsByQuery(options, 'ald')).toEqual([options[0]]);
    expect(filterSubjectsByQuery(options, 'BRU')).toEqual([options[1]]);
  });
});

import { describe, expect, it } from 'vitest';

import {
  filterCampaignImagesByQuery,
  findCampaignImageByRef,
  imageRefsEqual,
} from './image-ref-match.js';

describe('imageRefsEqual', () => {
  it('matches on local path', () => {
    expect(imageRefsEqual({ local: 'a/b/c.png' }, { local: 'a/b/c.png' })).toBe(true);
  });

  it('returns false when only one side is set', () => {
    expect(imageRefsEqual({ local: 'x' }, null)).toBe(false);
  });
});

describe('findCampaignImageByRef', () => {
  it('finds by matching image ref', () => {
    const images = [
      {
        id: '1',
        title: 'Hero',
        image: { local: 'camp/1/original.png', hash: 'abc' },
      },
    ] as unknown as Parameters<typeof findCampaignImageByRef>[0];
    const found = findCampaignImageByRef(images, { local: 'camp/1/original.png' });
    expect(found?.title).toBe('Hero');
  });
});

describe('filterCampaignImagesByQuery', () => {
  const images = [
    { id: '1', title: 'Tavern', caption: 'Interior', image: { local: 'a' } },
    { id: '2', title: 'Forest', caption: '', image: null },
  ] as unknown as Parameters<typeof filterCampaignImagesByQuery>[0];

  it('excludes images without a file', () => {
    expect(filterCampaignImagesByQuery(images, '')).toHaveLength(1);
  });

  it('filters by title and caption', () => {
    expect(filterCampaignImagesByQuery(images, 'interior')).toHaveLength(1);
    expect(filterCampaignImagesByQuery(images, 'forest')).toHaveLength(0);
  });
});

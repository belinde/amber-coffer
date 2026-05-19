import { describe, expect, it } from 'vitest';

import { getSessionErrorPresentation } from './session-error-presentation.js';

describe('getSessionErrorPresentation', () => {
  it('maps channel_not_linked with channel id param', () => {
    const view = getSessionErrorPresentation(
      'channel_not_linked: No campaign mapped to this voice channel',
      '999888777',
    );
    expect(view.titleKey).toBe('session.errors.channelNotLinked.title');
    expect(view.detailParams?.channelId).toBe('999888777');
  });
});

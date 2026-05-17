import { describe, expect, it } from 'vitest';

import { fieldErrorAt } from './field-error-helpers.js';

describe('fieldErrorAt', () => {
  it('returns exact path message', () => {
    expect(fieldErrorAt({ name: 'Required' }, 'name')).toBe('Required');
  });

  it('returns first nested message under prefix', () => {
    expect(
      fieldErrorAt({ 'eventsInteresting.0.summary': 'Too short' }, 'eventsInteresting'),
    ).toBe('Too short');
  });
});

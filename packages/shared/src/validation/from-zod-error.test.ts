import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { fieldValidationErrorFromZod } from './from-zod-error.js';

describe('fieldValidationErrorFromZod', () => {
  it('maps string too_small to string.min_length', () => {
    const schema = z.object({
      eventsInteresting: z.array(
        z.object({
          summary: z.string().min(1),
        }),
      ),
    });
    const result = schema.safeParse({ eventsInteresting: [{ summary: '' }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = fieldValidationErrorFromZod(result.error);
      expect(err.issues[0]).toMatchObject({
        code: 'string.min_length',
        path: ['eventsInteresting', 0, 'summary'],
        params: { min: 1 },
      });
    }
  });
});

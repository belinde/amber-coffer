import { describe, expect, it } from 'vitest';

import {
  sessionAssetPresignRequestSchema,
  sessionAssetPresignResponseSchema,
} from './session-asset.schema.js';

describe('sessionAssetPresignRequestSchema', () => {
  it('accepts a valid handout presign body', () => {
    const parsed = sessionAssetPresignRequestSchema.parse({
      campaignId: '018f0000-0000-7000-8000-000000000001',
      sessionId: '018f0000-0000-7000-8000-000000000002',
      assetKind: 'handout',
      contentType: 'image/webp',
      contentLength: 1024,
    });
    expect(parsed.assetKind).toBe('handout');
  });
});

describe('sessionAssetPresignResponseSchema', () => {
  it('requires a relative publicPath under session-assets', () => {
    expect(() =>
      sessionAssetPresignResponseSchema.parse({
        uploadUrl: 'https://example.com/upload',
        publicPath: 'https://evil.com/x.webp',
        objectKey: 'session-assets/x.webp',
        expiresAt: 1,
      }),
    ).toThrow();

    const ok = sessionAssetPresignResponseSchema.parse({
      uploadUrl: 'https://example.com/upload',
      publicPath: '/session-assets/camp/sess/handout/id.webp',
      objectKey: 'session-assets/camp/sess/handout/id.webp',
      expiresAt: 1,
    });
    expect(ok.publicPath.startsWith('/session-assets/')).toBe(true);
  });
});

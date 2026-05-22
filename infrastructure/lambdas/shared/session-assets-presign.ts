import { randomUUID } from 'node:crypto';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { ActivitySessionTokenClaims } from './activity-session-token.js';

const s3 = new S3Client({});

const PRESIGN_TTL_SECONDS = 300;
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024;

export type PresignBody = {
  campaignId?: string;
  sessionId?: string;
  assetKind?: string;
  contentType?: string;
  contentLength?: number;
};

export type PresignResult = {
  uploadUrl: string;
  publicPath: string;
  objectKey: string;
  expiresAt: number;
};

function isValidAssetKind(value: string): value is 'handout' | 'map-background' {
  return value === 'handout' || value === 'map-background';
}

function isValidContentType(value: string): value is 'image/jpeg' | 'image/png' | 'image/webp' {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';
}

export function validatePresignBody(
  body: PresignBody,
  claims: ActivitySessionTokenClaims,
):
  | {
      ok: true;
      normalized: Required<
        Pick<PresignBody, 'campaignId' | 'sessionId' | 'assetKind' | 'contentType'>
      > & { contentLength?: number };
    }
  | { ok: false; error: string } {
  const { campaignId, sessionId, assetKind, contentType, contentLength } = body;
  if (!campaignId || !sessionId || !assetKind || !contentType) {
    return { ok: false, error: 'missing_fields' };
  }
  if (campaignId !== claims.campaignId || sessionId !== claims.sessionId) {
    return { ok: false, error: 'session_mismatch' };
  }
  if (!isValidAssetKind(assetKind)) {
    return { ok: false, error: 'invalid_asset_kind' };
  }
  if (!isValidContentType(contentType)) {
    return { ok: false, error: 'invalid_content_type' };
  }
  if (contentLength !== undefined) {
    if (
      !Number.isFinite(contentLength) ||
      contentLength <= 0 ||
      contentLength > MAX_CONTENT_LENGTH
    ) {
      return { ok: false, error: 'invalid_content_length' };
    }
  }
  return {
    ok: true,
    normalized: {
      campaignId,
      sessionId,
      assetKind,
      contentType,
      ...(contentLength !== undefined ? { contentLength } : {}),
    },
  };
}

export async function createSessionAssetPresign(args: {
  bucketName: string;
  publicPrefix: string;
  campaignId: string;
  sessionId: string;
  assetKind: 'handout' | 'map-background';
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  contentLength?: number;
}): Promise<PresignResult> {
  const assetId = randomUUID();
  const prefix = args.publicPrefix.replace(/^\//, '').replace(/\/$/, '');
  const objectKey = `${prefix}/${args.campaignId}/${args.sessionId}/${args.assetKind}/${assetId}.webp`;
  const publicPath = `/${objectKey}`;

  const command = new PutObjectCommand({
    Bucket: args.bucketName,
    Key: objectKey,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=300',
    ...(args.contentLength !== undefined ? { ContentLength: args.contentLength } : {}),
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_TTL_SECONDS });
  const expiresAt = Math.floor(Date.now() / 1000) + PRESIGN_TTL_SECONDS;

  return { uploadUrl, publicPath, objectKey, expiresAt };
}

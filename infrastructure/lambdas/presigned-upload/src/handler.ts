import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

import {
  extractBearerToken,
  verifyActivitySessionToken,
  type ActivitySessionTokenClaims,
} from '../../shared/activity-session-token.js';
import { jsonResponse, SYNC_CORS_HEADERS } from '../../shared/http-response.js';

const s3 = new S3Client({});
const secrets = new SecretsManagerClient({});

const BUCKET_NAME = process.env.BUCKET_NAME ?? '';
const SESSION_AUTH_SECRET_ARN = process.env.SESSION_AUTH_SECRET_ARN ?? '';

/** Presigned PUT URLs are valid for 15 minutes. */
const PRESIGN_TTL_SECONDS = 15 * 60;
const MAX_KEYS = 50;

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cachedAuthSecret: string | null = null;

async function loadAuthSecret(): Promise<string> {
  if (cachedAuthSecret) {
    return cachedAuthSecret;
  }
  const result = await secrets.send(
    new GetSecretValueCommand({ SecretId: SESSION_AUTH_SECRET_ARN }),
  );
  const value = result.SecretString;
  if (!value) {
    throw new Error('session_auth_secret_empty');
  }
  cachedAuthSecret = value;
  return value;
}

async function authenticate(
  authorization: string | undefined,
): Promise<ActivitySessionTokenClaims | null> {
  const token = extractBearerToken(authorization);
  if (!token) {
    return null;
  }
  const secret = await loadAuthSecret();
  return verifyActivitySessionToken(token, secret);
}

function isValidUuidV7(value: unknown): value is string {
  return typeof value === 'string' && UUID_V7_REGEX.test(value);
}

type RequestBody = {
  campaignId?: unknown;
  keys?: unknown;
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const method = event.requestContext.http.method;
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: SYNC_CORS_HEADERS, body: '' };
  }

  if (method !== 'POST') {
    return jsonResponse(404, { error: 'not_found' });
  }

  if (!BUCKET_NAME || !SESSION_AUTH_SECRET_ARN) {
    return jsonResponse(503, { error: 'not_configured' });
  }

  // Extract and validate campaignId from path parameters
  const pathCampaignId = event.pathParameters?.campaignId;
  if (!isValidUuidV7(pathCampaignId)) {
    return jsonResponse(400, { error: 'invalid_campaign_id' });
  }

  // Parse request body
  let body: RequestBody;
  try {
    body = JSON.parse(event.body ?? '{}') as RequestBody;
  } catch {
    return jsonResponse(400, { error: 'invalid_json' });
  }

  // Validate body campaignId matches path parameter
  if (body.campaignId !== undefined && body.campaignId !== pathCampaignId) {
    return jsonResponse(400, { error: 'campaign_id_mismatch' });
  }

  // Validate keys array
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    return jsonResponse(400, { error: 'invalid_request' });
  }
  if (body.keys.length > MAX_KEYS) {
    return jsonResponse(400, { error: 'too_many_keys' });
  }
  if (!body.keys.every((k): k is string => typeof k === 'string' && k.length > 0)) {
    return jsonResponse(400, { error: 'invalid_request' });
  }
  const keys = body.keys;

  // Authenticate
  const claims = await authenticate(event.headers.authorization);
  if (!claims) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  // Authorize: must be master role and campaignId must match
  if (claims.role !== 'master' || claims.campaignId !== pathCampaignId) {
    return jsonResponse(403, { error: 'forbidden' });
  }

  // Generate presigned PUT URLs for each key
  try {
    const urls: Record<string, string> = {};
    const presignPromises = keys.map(async (key) => {
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=86400',
      });
      const url = await getSignedUrl(s3, command, { expiresIn: PRESIGN_TTL_SECONDS });
      urls[key] = url;
    });
    await Promise.all(presignPromises);
    return jsonResponse(200, { urls });
  } catch (err) {
    console.error('presign_failed', err);
    return jsonResponse(502, { error: 'upstream_storage_failure' });
  }
};

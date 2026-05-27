import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

import {
  extractBearerToken,
  verifyActivitySessionToken,
} from '../../shared/activity-session-token.js';
import { jsonResponse, SYNC_CORS_HEADERS } from '../../shared/http-response.js';

const s3 = new S3Client({});
const secrets = new SecretsManagerClient({});

const BUCKET_NAME = process.env.BUCKET_NAME ?? '';
const SESSION_AUTH_SECRET_ARN = process.env.SESSION_AUTH_SECRET_ARN ?? '';

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

function isValidUuidV7(value: string): boolean {
  return UUID_V7_REGEX.test(value);
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const method = event.requestContext.http.method;
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: SYNC_CORS_HEADERS, body: '' };
  }

  if (method !== 'GET') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  if (!BUCKET_NAME || !SESSION_AUTH_SECRET_ARN) {
    return jsonResponse(503, { error: 'not_configured' });
  }

  // Extract and validate campaignId from path parameters
  const campaignId = event.pathParameters?.campaignId;
  if (!campaignId) {
    return jsonResponse(400, { error: 'missing_campaign_id' });
  }
  if (!isValidUuidV7(campaignId)) {
    return jsonResponse(400, { error: 'invalid_campaign_id' });
  }

  // Verify Bearer token
  const token = extractBearerToken(event.headers.authorization);
  if (!token) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  let secret: string;
  try {
    secret = await loadAuthSecret();
  } catch (err) {
    console.error('auth_secret_load_failed', err);
    return jsonResponse(503, { error: 'not_configured' });
  }

  const claims = verifyActivitySessionToken(token, secret);
  if (!claims) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  // Verify role and campaignId match
  if (claims.role !== 'master') {
    return jsonResponse(403, { error: 'forbidden' });
  }
  if (claims.campaignId !== campaignId) {
    return jsonResponse(403, { error: 'forbidden' });
  }

  // List all objects under the campaign prefix, handling pagination
  const prefix = `campaign-images/${campaignId}/`;
  const images: Array<{ key: string; etag: string }> = [];

  try {
    let continuationToken: string | undefined;
    do {
      const response = await s3.send(
        new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key && obj.ETag) {
            images.push({ key: obj.Key, etag: obj.ETag });
          }
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
  } catch (err) {
    console.error('s3_list_objects_failed', err);
    return jsonResponse(502, { error: 'upstream_storage_failure' });
  }

  return jsonResponse(200, { images });
};

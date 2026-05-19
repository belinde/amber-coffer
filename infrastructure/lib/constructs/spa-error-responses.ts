import * as cdk from 'aws-cdk-lib';
import type * as cloudfront from 'aws-cdk-lib/aws-cloudfront';

/** SPA fallback: S3 403/404 → index.html */
export const SPA_ERROR_RESPONSES: cloudfront.ErrorResponse[] = [
  {
    httpStatus: 403,
    responseHttpStatus: 200,
    responsePagePath: '/index.html',
    ttl: cdk.Duration.seconds(0),
  },
  {
    httpStatus: 404,
    responseHttpStatus: 200,
    responsePagePath: '/index.html',
    ttl: cdk.Duration.seconds(0),
  },
];

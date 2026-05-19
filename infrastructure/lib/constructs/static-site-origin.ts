import type * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontLib from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import { type Construct } from 'constructs';

export function createOriginAccessControl(
  scope: Construct,
  id: string,
  description: string,
): cloudfrontLib.S3OriginAccessControl {
  return new cloudfrontLib.S3OriginAccessControl(scope, id, {
    originAccessControlName: id,
    description,
    signing: cloudfrontLib.Signing.SIGV4_ALWAYS,
  });
}

/** S3 origin with OAC for CloudFront (bucket stays private). */
export function createS3Origin(
  bucket: s3.IBucket,
  originAccessControl: cloudfrontLib.S3OriginAccessControl,
): cloudfront.IOrigin {
  return origins.S3BucketOrigin.withOriginAccessControl(bucket, {
    originAccessControl,
  });
}

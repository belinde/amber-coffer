import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { PROJECT_NAME } from '../constants.js';

/** S3 + CloudFront for public Amber canon sites (placeholder). */
export class PublicCanonStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('Project', PROJECT_NAME);
    cdk.Tags.of(this).add('Component', 'public-canon');

    // TODO: S3 bucket, CloudFront distribution, path-based campaign hosting
  }
}

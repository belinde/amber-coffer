import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { applyStackTags } from '../constructs/stack-tags.js';

import type { AmberStackProps } from './base-stack-props.js';

/** S3 + CloudFront for public Amber canon sites (placeholder). */
export class PublicCanonStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AmberStackProps) {
    super(scope, id, props);

    applyStackTags(this, 'public-canon', props.envName);

    // TODO: S3 bucket, CloudFront distribution, path-based campaign hosting
  }
}

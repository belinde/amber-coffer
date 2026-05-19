import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { applyStackTags } from '../constructs/stack-tags.js';

import type { AmberStackProps } from './base-stack-props.js';

/** AWS Bedrock access for subscription-based AI pipeline (placeholder). */
export class AiBedrockStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AmberStackProps) {
    super(scope, id, props);

    applyStackTags(this, 'ai-bedrock', props.envName);

    // TODO: IAM roles, model access policies for Claude Haiku/Sonnet
  }
}

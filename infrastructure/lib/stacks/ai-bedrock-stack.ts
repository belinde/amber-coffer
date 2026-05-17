import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { PROJECT_NAME } from '../constants.js';

/** AWS Bedrock access for subscription-based AI pipeline (placeholder). */
export class AiBedrockStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('Project', PROJECT_NAME);
    cdk.Tags.of(this).add('Component', 'ai-bedrock');

    // TODO: IAM roles, model access policies for Claude Haiku/Sonnet
  }
}

import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { PROJECT_NAME } from '../constants.js';

/** DynamoDB table for Discord channel_id ↔ campaign handshake (placeholder). */
export class SessionHandshakeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('Project', PROJECT_NAME);
    cdk.Tags.of(this).add('Component', 'session-handshake');

    // TODO: DynamoDB table with channel_id partition key
  }
}

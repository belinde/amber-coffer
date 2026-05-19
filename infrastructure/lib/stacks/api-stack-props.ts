import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

import type { AmberStackProps } from './base-stack-props.js';

export interface ApiStackProps extends AmberStackProps {
  readonly handshakeTable: dynamodb.Table;
  readonly sessionSyncTable: dynamodb.Table;
  readonly sessionAuthSecret: secretsmanager.Secret;
}

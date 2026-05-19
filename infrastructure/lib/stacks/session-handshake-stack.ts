import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';

import { resourceName, ssmPath } from '../config/naming.js';
import { applyStackTags } from '../constructs/stack-tags.js';

import type { AmberStackProps } from './base-stack-props.js';

function pointInTimeRecoveryForEnv(envName: string): dynamodb.PointInTimeRecoverySpecification {
  return { pointInTimeRecoveryEnabled: envName === 'prod' };
}

/**
 * Maps Discord voice `channel_id` → active campaign/session for Player Activity handshake.
 * Hosts tactical sync state (HTTP polling) and session JWT signing secret.
 */
export class SessionHandshakeStack extends cdk.Stack {
  readonly table: dynamodb.Table;
  readonly sessionSyncTable: dynamodb.Table;
  readonly sessionAuthSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: AmberStackProps) {
    super(scope, id, props);

    applyStackTags(this, 'session-handshake', props.envName);

    this.table = new dynamodb.Table(this, 'HandshakeTable', {
      tableName: resourceName(props.envName, 'handshake'),
      partitionKey: { name: 'channel_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:
        props.envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: pointInTimeRecoveryForEnv(props.envName),
    });

    this.sessionSyncTable = new dynamodb.Table(this, 'SessionSyncTable', {
      tableName: resourceName(props.envName, 'session-sync'),
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:
        props.envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: pointInTimeRecoveryForEnv(props.envName),
    });

    this.sessionAuthSecret = new secretsmanager.Secret(this, 'SessionAuthSecret', {
      secretName: resourceName(props.envName, 'session-auth-secret'),
      description: 'HMAC secret for session sync JWT (player + master)',
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
    });

    new ssm.StringParameter(this, 'HandshakeTableNameParam', {
      parameterName: ssmPath(props.envName, 'handshake', 'table-name'),
      stringValue: this.table.tableName,
    });

    new ssm.StringParameter(this, 'SessionSyncTableNameParam', {
      parameterName: ssmPath(props.envName, 'session-sync', 'table-name'),
      stringValue: this.sessionSyncTable.tableName,
    });
  }
}

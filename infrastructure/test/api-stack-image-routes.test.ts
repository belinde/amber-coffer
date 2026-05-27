import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { describe, it, beforeAll, vi } from 'vitest';

// Mock NodejsFunction to avoid entry file resolution issues in tests.
// NodejsFunction validates that the entry file exists at construction time,
// but the path resolution differs between compiled dist/ and source ts.
vi.mock('aws-cdk-lib/aws-lambda-nodejs', () => {
  return {
    NodejsFunction: class MockNodejsFunction extends lambda.Function {
      constructor(scope: cdk.Stack, id: string, props: Record<string, unknown>) {
        const { entry: _entry, bundling: _bundling, depsLockFilePath: _deps, ...rest } = props;
        super(scope, id, {
          ...rest,
          code: lambda.Code.fromInline('// mock'),
          handler: 'index.handler',
          runtime: (rest.runtime as lambda.Runtime) ?? lambda.Runtime.NODEJS_22_X,
        });
      }
    },
  };
});

import { ApiStack } from '../lib/stacks/api-stack.js';

/**
 * CDK assertion tests for image manifest and presigned upload Lambda routes.
 * Validates: Requirements 3.2, 9.2
 */
describe('ApiStack — image sync routes', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();

    // Create prerequisite resources in a support stack
    const supportStack = new cdk.Stack(app, 'SupportStack', {
      env: { account: '123456789012', region: 'eu-west-1' },
    });

    const handshakeTable = new dynamodb.Table(supportStack, 'HandshakeTable', {
      tableName: 'test-handshake',
      partitionKey: { name: 'channel_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const sessionSyncTable = new dynamodb.Table(supportStack, 'SessionSyncTable', {
      tableName: 'test-session-sync',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const sessionAuthSecret = new secretsmanager.Secret(supportStack, 'SessionAuthSecret', {
      secretName: 'test-session-auth-secret',
    });

    const playerActivityBucket = new s3.Bucket(supportStack, 'PlayerActivityBucket', {
      bucketName: 'test-player-activity',
    });

    const apiStack = new ApiStack(app, 'TestApiStack', {
      env: { account: '123456789012', region: 'eu-west-1' },
      envName: 'prod',
      handshakeTable,
      sessionSyncTable,
      sessionAuthSecret,
      playerActivityBucket,
    });

    template = Template.fromStack(apiStack);
  });

  describe('Image Manifest Lambda', () => {
    it('creates a Lambda function for the image manifest handler', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'amber-coffer-prod-api-image-manifest',
        Runtime: 'nodejs22.x',
        Environment: {
          Variables: Match.objectLike({
            BUCKET_NAME: Match.anyValue(),
            SESSION_AUTH_SECRET_ARN: Match.anyValue(),
          }),
        },
      });
    });

    it('has a GET route at /campaign/{campaignId}/images/manifest', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'GET /campaign/{campaignId}/images/manifest',
      });
    });
  });

  describe('Presigned Upload Lambda', () => {
    it('creates a Lambda function for the presigned upload handler', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'amber-coffer-prod-api-presigned-upload',
        Runtime: 'nodejs22.x',
        Environment: {
          Variables: Match.objectLike({
            BUCKET_NAME: Match.anyValue(),
            SESSION_AUTH_SECRET_ARN: Match.anyValue(),
          }),
        },
      });
    });

    it('has a POST route at /campaign/{campaignId}/images/presigned-urls', () => {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'POST /campaign/{campaignId}/images/presigned-urls',
      });
    });
  });

  describe('IAM permissions', () => {
    it('grants S3 read (ListBucket/GetObject) to the image manifest Lambda', () => {
      // grantRead creates a policy with s3:GetObject*, s3:GetBucket*, s3:List*
      // scoped to the bucket and campaign-images/* prefix
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['s3:GetObject*', 's3:GetBucket*', 's3:List*']),
              Effect: 'Allow',
            }),
          ]),
        },
        Roles: Match.arrayWith([
          Match.objectLike({ Ref: Match.stringLikeRegexp('ImageManifestFn') }),
        ]),
      });
    });

    it('grants S3 PutObject to the presigned upload Lambda', () => {
      // grantPut creates a policy with individual s3:PutObject* actions and s3:Abort*
      // scoped to campaign-images/* prefix
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['s3:PutObject', 's3:Abort*']),
              Effect: 'Allow',
            }),
          ]),
        },
        Roles: Match.arrayWith([
          Match.objectLike({ Ref: Match.stringLikeRegexp('PresignedUploadFn') }),
        ]),
      });
    });
  });
});

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';

import { getEnvironmentConfig } from '../config/environment.js';
import { hostFqdn } from '../config/hosts.js';
import { resourceName, ssmPath } from '../config/naming.js';
import { createOneYearLogGroup } from '../constructs/one-year-log-group.js';
import { applyStackTags } from '../constructs/stack-tags.js';

import type { ApiStackProps } from './api-stack-props.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POLL_INTERVAL_MS = '2000';

/** HTTP API — session handshake, tactical sync polling, master token. */
export class ApiStack extends cdk.Stack {
  readonly httpApi: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    applyStackTags(this, 'api', props.envName);

    const config = getEnvironmentConfig(props.envName);
    const apiHostname = hostFqdn('api', props.envName);

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: config.hostedZoneId,
      zoneName: config.rootDomain,
    });

    const apiCertificate = new acm.Certificate(this, 'ApiCertificate', {
      domainName: apiHostname,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    const discordClientSecret = new secretsmanager.Secret(this, 'DiscordClientSecret', {
      secretName: resourceName(props.envName, 'discord-client-secret'),
      description: 'Discord Application client secret for Activity OAuth code exchange',
      secretStringValue: cdk.SecretValue.unsafePlainText('REPLACE_ME'),
    });

    const handshakeLogGroup = createOneYearLogGroup(this, 'HandshakeFnLogGroup');
    const syncLogGroup = createOneYearLogGroup(this, 'SessionSyncFnLogGroup');
    const masterTokenLogGroup = createOneYearLogGroup(this, 'MasterTokenFnLogGroup');

    const handshakeFn = new NodejsFunction(this, 'HandshakeFn', {
      functionName: resourceName(props.envName, 'api-handshake'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: path.join(__dirname, '../../../lambdas/session-handshake/src/handler.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      logGroup: handshakeLogGroup,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
      },
      environment: {
        HANDSHAKE_TABLE_NAME: props.handshakeTable.tableName,
        SESSION_AUTH_SECRET_ARN: props.sessionAuthSecret.secretArn,
        POLL_INTERVAL_MS,
        DISCORD_APPLICATION_ID: '1505870393007935598',
        DISCORD_CLIENT_SECRET_ARN: discordClientSecret.secretArn,
      },
    });

    const sessionSyncFn = new NodejsFunction(this, 'SessionSyncFn', {
      functionName: resourceName(props.envName, 'api-session-sync'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: path.join(__dirname, '../../../lambdas/session-sync/src/handler.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      logGroup: syncLogGroup,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
      },
      environment: {
        SESSION_SYNC_TABLE_NAME: props.sessionSyncTable.tableName,
        SESSION_AUTH_SECRET_ARN: props.sessionAuthSecret.secretArn,
        SESSION_ASSETS_BUCKET_NAME: props.playerActivityBucket.bucketName,
        SESSION_ASSETS_PUBLIC_PREFIX: '/session-assets',
      },
    });

    const masterTokenFn = new NodejsFunction(this, 'MasterTokenFn', {
      functionName: resourceName(props.envName, 'api-master-token'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: path.join(__dirname, '../../../lambdas/session-master-token/src/handler.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      logGroup: masterTokenLogGroup,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
      },
      environment: {
        SESSION_AUTH_SECRET_ARN: props.sessionAuthSecret.secretArn,
        HANDSHAKE_TABLE_NAME: props.handshakeTable.tableName,
        POLL_INTERVAL_MS,
        DISCORD_APPLICATION_ID: '1505870393007935598',
      },
    });

    props.handshakeTable.grantReadWriteData(handshakeFn);
    props.handshakeTable.grantReadWriteData(masterTokenFn);
    props.sessionSyncTable.grantReadWriteData(sessionSyncFn);
    props.playerActivityBucket.grantPut(sessionSyncFn, 'session-assets/*');
    props.sessionAuthSecret.grantRead(handshakeFn);
    props.sessionAuthSecret.grantRead(sessionSyncFn);
    props.sessionAuthSecret.grantRead(masterTokenFn);
    discordClientSecret.grantRead(handshakeFn);

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: resourceName(props.envName, 'http-api'),
      description: `Amber Coffer ${props.envName} HTTP API`,
      corsPreflight: {
        allowHeaders: ['content-type', 'authorization', 'if-none-match'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ['*'],
      },
    });

    const handshakeIntegration = new integrations.HttpLambdaIntegration(
      'HandshakeIntegration',
      handshakeFn,
    );
    const syncIntegration = new integrations.HttpLambdaIntegration(
      'SessionSyncIntegration',
      sessionSyncFn,
    );
    const masterTokenIntegration = new integrations.HttpLambdaIntegration(
      'MasterTokenIntegration',
      masterTokenFn,
    );

    this.httpApi.addRoutes({
      path: '/session/handshake',
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: handshakeIntegration,
    });

    this.httpApi.addRoutes({
      path: '/session/handshake/channel',
      methods: [apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.OPTIONS],
      integration: handshakeIntegration,
    });

    this.httpApi.addRoutes({
      path: '/session/sync/state',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.OPTIONS],
      integration: syncIntegration,
    });

    this.httpApi.addRoutes({
      path: '/session/sync/snapshot',
      methods: [apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.OPTIONS],
      integration: syncIntegration,
    });

    this.httpApi.addRoutes({
      path: '/session/sync/events',
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: syncIntegration,
    });

    this.httpApi.addRoutes({
      path: '/session/master/token',
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: masterTokenIntegration,
    });

    this.httpApi.addRoutes({
      path: '/session/assets/presign',
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.OPTIONS],
      integration: syncIntegration,
    });

    const domainName = new apigwv2.DomainName(this, 'ApiDomain', {
      domainName: apiHostname,
      certificate: apiCertificate,
    });

    new apigwv2.ApiMapping(this, 'ApiMapping', {
      api: this.httpApi,
      domainName,
      stage: this.httpApi.defaultStage!,
    });

    const recordName = apiHostname.replace(`.${config.rootDomain}`, '');

    new route53.ARecord(this, 'ApiAliasA', {
      zone: hostedZone,
      recordName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayv2DomainProperties(
          domainName.regionalDomainName,
          domainName.regionalHostedZoneId,
        ),
      ),
    });

    new route53.AaaaRecord(this, 'ApiAliasAaaa', {
      zone: hostedZone,
      recordName,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayv2DomainProperties(
          domainName.regionalDomainName,
          domainName.regionalHostedZoneId,
        ),
      ),
    });

    new ssm.StringParameter(this, 'HttpApiUrlParam', {
      parameterName: ssmPath(props.envName, 'api', 'http-api-url'),
      stringValue: `https://${apiHostname}`,
    });

    new ssm.StringParameter(this, 'HttpApiIdParam', {
      parameterName: ssmPath(props.envName, 'api', 'http-api-id'),
      stringValue: this.httpApi.apiId,
    });

    new ssm.StringParameter(this, 'HandshakeUrlParam', {
      parameterName: ssmPath(props.envName, 'api', 'handshake-url'),
      stringValue: `https://${apiHostname}/session/handshake`,
    });

    new ssm.StringParameter(this, 'SyncStateUrlParam', {
      parameterName: ssmPath(props.envName, 'api', 'sync-state-url'),
      stringValue: `https://${apiHostname}/session/sync/state`,
    });

    new ssm.StringParameter(this, 'SessionAssetsPresignUrlParam', {
      parameterName: ssmPath(props.envName, 'api', 'session-assets-presign-url'),
      stringValue: `https://${apiHostname}/session/assets/presign`,
    });

    new ssm.StringParameter(this, 'SessionAssetsPublicPrefixParam', {
      parameterName: ssmPath(props.envName, 'web', 'session-assets-public-prefix'),
      stringValue: '/session-assets',
    });
  }
}

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';

import { getEnvironmentConfig } from '../config/environment.js';
import { hostFqdn } from '../config/hosts.js';
import { resourceName, ssmPath } from '../config/naming.js';
import { createOneYearLogGroup } from '../constructs/one-year-log-group.js';
import { SPA_ERROR_RESPONSES } from '../constructs/spa-error-responses.js';
import { applyStackTags } from '../constructs/stack-tags.js';
import { createOriginAccessControl, createS3Origin } from '../constructs/static-site-origin.js';

import type { AmberStackProps } from './base-stack-props.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface WebEdgeStackProps extends AmberStackProps {
  readonly cloudfrontCertificateArn: string;
}

function aliasRecord(
  scope: Construct,
  id: string,
  hostedZone: route53.IHostedZone,
  recordName: string,
  distribution: cloudfront.IDistribution,
): void {
  new route53.ARecord(scope, `${id}A`, {
    zone: hostedZone,
    recordName,
    target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
  });
  new route53.AaaaRecord(scope, `${id}Aaaa`, {
    zone: hostedZone,
    recordName,
    target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
  });
}

/**
 * S3 + CloudFront for vitrine and player-activity.
 * Two distributions (shared ACM cert): CloudFront cache behaviors are path-based, not host-based.
 */
export class WebEdgeStack extends cdk.Stack {
  readonly vitrineDistribution: cloudfront.Distribution;
  readonly tableDistribution: cloudfront.Distribution;
  readonly vitrineBucket: s3.Bucket;
  readonly playerActivityBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: WebEdgeStackProps) {
    super(scope, id, props);

    applyStackTags(this, 'web-edge', props.envName);

    const config = getEnvironmentConfig(props.envName);

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: config.hostedZoneId,
      zoneName: config.rootDomain,
    });

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'CloudFrontCertificate',
      props.cloudfrontCertificateArn,
    );

    const oac = createOriginAccessControl(
      this,
      'WebOac',
      `OAC for ${props.envName} static web origins`,
    );

    this.vitrineBucket = new s3.Bucket(this, 'VitrineBucket', {
      bucketName: resourceName(props.envName, 'web-vitrine'),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    this.playerActivityBucket = new s3.Bucket(this, 'PlayerActivityBucket', {
      bucketName: resourceName(props.envName, 'web-player-activity'),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    const vitrineOrigin = createS3Origin(this.vitrineBucket as s3.IBucket, oac);
    const tableOrigin = createS3Origin(this.playerActivityBucket as s3.IBucket, oac);

    const staticCachePolicy = new cloudfront.CachePolicy(this, 'StaticAssetCache', {
      cachePolicyName: resourceName(props.envName, 'static-asset-cache'),
      defaultTtl: cdk.Duration.days(30),
      minTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.days(365),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const spaCachePolicy = new cloudfront.CachePolicy(this, 'SpaShellCache', {
      cachePolicyName: resourceName(props.envName, 'spa-shell-cache'),
      defaultTtl: cdk.Duration.seconds(0),
      minTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.seconds(1),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    const vitrineDomainNames =
      props.envName === 'prod'
        ? [hostFqdn('apex', props.envName), hostFqdn('www', props.envName)]
        : [hostFqdn('www', props.envName)];

    this.vitrineDistribution = new cloudfront.Distribution(this, 'VitrineDistribution', {
      comment: `Amber Coffer ${props.envName} vitrine`,
      domainNames: vitrineDomainNames,
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: vitrineOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: staticCachePolicy,
        compress: true,
      },
    });

    this.tableDistribution = new cloudfront.Distribution(this, 'TableDistribution', {
      comment: `Amber Coffer ${props.envName} player-activity`,
      domainNames: [hostFqdn('table', props.envName)],
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: tableOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: spaCachePolicy,
        compress: true,
        responseHeadersPolicy:
          cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT,
      },
      errorResponses: SPA_ERROR_RESPONSES,
    });

    for (const recordName of vitrineDomainNames) {
      const label =
        recordName === config.rootDomain
          ? undefined
          : recordName.replace(`.${config.rootDomain}`, '');
      aliasRecord(
        this,
        `Vitrine${label ?? 'Apex'}`,
        hostedZone,
        label ?? '',
        this.vitrineDistribution,
      );
    }

    const tableLabel = hostFqdn('table', props.envName).replace(`.${config.rootDomain}`, '');
    aliasRecord(this, 'Table', hostedZone, tableLabel, this.tableDistribution);

    const vitrineDeployLogGroup = createOneYearLogGroup(this, 'VitrineDeployLogGroup');

    new s3deploy.BucketDeployment(this, 'VitrinePlaceholderDeploy', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../../assets/vitrine-placeholder'))],
      destinationBucket: this.vitrineBucket as s3.IBucket,
      distribution: this.vitrineDistribution,
      distributionPaths: ['/*'],
      logGroup: vitrineDeployLogGroup,
    });

    new ssm.StringParameter(this, 'VitrineDistributionIdParam', {
      parameterName: ssmPath(props.envName, 'web', 'vitrine-distribution-id'),
      stringValue: this.vitrineDistribution.distributionId,
    });

    new ssm.StringParameter(this, 'TableDistributionIdParam', {
      parameterName: ssmPath(props.envName, 'web', 'table-distribution-id'),
      stringValue: this.tableDistribution.distributionId,
    });

    new ssm.StringParameter(this, 'VitrineBucketNameParam', {
      parameterName: ssmPath(props.envName, 'web', 'vitrine-bucket-name'),
      stringValue: this.vitrineBucket.bucketName,
    });

    new ssm.StringParameter(this, 'PlayerActivityBucketNameParam', {
      parameterName: ssmPath(props.envName, 'web', 'player-activity-bucket-name'),
      stringValue: this.playerActivityBucket.bucketName,
    });
  }
}

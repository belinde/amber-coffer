import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';

import { getEnvironmentConfig, ROOT_DOMAIN } from '../config/environment.js';
import { ssmPath } from '../config/naming.js';
import { applyStackTags } from '../constructs/stack-tags.js';

import type { AmberStackProps } from './base-stack-props.js';

/** ACM in us-east-1 for CloudFront (apex, www, wildcard). */
export class CertificateStack extends cdk.Stack {
  readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: AmberStackProps) {
    const config = getEnvironmentConfig(props.envName);
    super(scope, id, {
      ...props,
      env: {
        ...props.env,
        region: config.cloudfrontCertRegion,
      },
    });

    applyStackTags(this, 'certificate', props.envName);

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: config.hostedZoneId,
      zoneName: config.rootDomain,
    });

    this.certificate = new acm.Certificate(this, 'CloudFrontCertificate', {
      domainName: ROOT_DOMAIN,
      subjectAlternativeNames: [`www.${ROOT_DOMAIN}`, `*.${ROOT_DOMAIN}`],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    new ssm.StringParameter(this, 'CloudFrontCertificateArnParam', {
      parameterName: ssmPath(props.envName, 'cert', 'cloudfront-certificate-arn'),
      stringValue: this.certificate.certificateArn,
      description: 'ACM certificate ARN (us-east-1) for CloudFront web distribution',
    });
  }
}

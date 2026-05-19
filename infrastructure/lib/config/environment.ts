/** Deployment environment — same CDK code, different context (`-c env=`). */
export type DeployEnvironment = 'prod' | 'dev';

export const DEPLOY_ENVIRONMENTS: readonly DeployEnvironment[] = ['prod', 'dev'];

/** Existing Route53 hosted zone — never create a new zone in CDK. */
export const HOSTED_ZONE_ID = 'Z06272853TVZ225L4FXR9';

export const ROOT_DOMAIN = 'ambercoffer.belinde.click';

/** Primary workload region (IoT, API, S3 origins, DynamoDB). */
export const WORKLOAD_REGION = 'eu-west-1';

/** ACM region required for CloudFront custom certificates. */
export const CLOUDFRONT_CERT_REGION = 'us-east-1';

export function parseDeployEnvironment(value: string | undefined): DeployEnvironment {
  if (value === 'prod' || value === 'dev') {
    return value;
  }
  throw new Error(`Invalid CDK context "env": expected prod|dev, got ${String(value)}`);
}

export interface EnvironmentConfig {
  readonly name: DeployEnvironment;
  readonly hostedZoneId: string;
  readonly rootDomain: string;
  readonly workloadRegion: string;
  readonly cloudfrontCertRegion: string;
}

export function getEnvironmentConfig(name: DeployEnvironment): EnvironmentConfig {
  return {
    name,
    hostedZoneId: HOSTED_ZONE_ID,
    rootDomain: ROOT_DOMAIN,
    workloadRegion: WORKLOAD_REGION,
    cloudfrontCertRegion: CLOUDFRONT_CERT_REGION,
  };
}

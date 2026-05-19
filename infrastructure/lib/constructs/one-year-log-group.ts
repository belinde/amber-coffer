import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

/** CloudWatch log group with project-standard retention (365 days). */
export function createOneYearLogGroup(scope: Construct, id: string): logs.LogGroup {
  return new logs.LogGroup(scope, id, {
    retention: logs.RetentionDays.ONE_YEAR,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });
}

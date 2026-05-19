import type * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { IConstruct } from 'constructs';

/** One-year retention for all CloudWatch log groups created in the app. */
export const LOG_RETENTION_DAYS = 365;

export class LogRetentionAspect implements cdk.IAspect {
  visit(node: IConstruct): void {
    if (node instanceof logs.CfnLogGroup) {
      node.addPropertyOverride('RetentionInDays', LOG_RETENTION_DAYS);
    }
  }
}

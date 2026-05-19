import type * as cdk from 'aws-cdk-lib';

import type { DeployEnvironment } from '../config/environment.js';

export interface AmberStackProps extends cdk.StackProps {
  readonly envName: DeployEnvironment;
}

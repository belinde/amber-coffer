import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { DeployEnvironment } from '../config/environment.js';
import { PROJECT_NAME } from '../constants.js';

export function applyStackTags(
  scope: Construct,
  component: string,
  envName: DeployEnvironment,
): void {
  cdk.Tags.of(scope).add('Project', PROJECT_NAME);
  cdk.Tags.of(scope).add('Environment', envName);
  cdk.Tags.of(scope).add('Component', component);
}

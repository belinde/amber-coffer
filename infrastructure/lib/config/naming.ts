import { PROJECT_NAME } from '../constants.js';

import type { DeployEnvironment } from './environment.js';

/** AWS resource name: `amber-coffer-{env}-{suffix}` */
export function resourceName(env: DeployEnvironment, suffix: string): string {
  return `${PROJECT_NAME}-${env}-${suffix}`;
}

/** SSM parameter path prefix: `/amber-coffer/{env}/...` */
export function ssmPath(env: DeployEnvironment, ...segments: string[]): string {
  return `/${PROJECT_NAME}/${env}/${segments.join('/')}`;
}

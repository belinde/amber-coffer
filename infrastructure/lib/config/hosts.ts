import type { DeployEnvironment } from './environment.js';
import { ROOT_DOMAIN } from './environment.js';

/** Logical web/API surface identifiers. */
export type ServiceHostKey = 'apex' | 'www' | 'table' | 'api';

const SERVICE_LABELS: Record<Exclude<ServiceHostKey, 'apex'>, string> = {
  www: 'www',
  table: 'table',
  api: 'api',
};

function serviceLabel(key: ServiceHostKey, env: DeployEnvironment): string {
  if (key === 'apex') {
    return '';
  }
  const base = SERVICE_LABELS[key];
  return env === 'dev' ? `${base}-dev` : base;
}

/**
 * FQDN for a service in the given environment.
 * - prod apex → `ambercoffer.belinde.click`
 * - dev table → `table-dev.ambercoffer.belinde.click`
 */
export function hostFqdn(key: ServiceHostKey, env: DeployEnvironment): string {
  if (key === 'apex') {
    if (env === 'dev') {
      throw new Error('apex host is prod-only; use www-dev for dev marketing site');
    }
    return ROOT_DOMAIN;
  }
  const label = serviceLabel(key, env);
  return `${label}.${ROOT_DOMAIN}`;
}

/** Hostnames provisioned per environment (DNS + CloudFront / API custom domains). */
export function hostsForEnvironment(env: DeployEnvironment): ServiceHostKey[] {
  if (env === 'prod') {
    return ['apex', 'www', 'table', 'api'];
  }
  return ['www', 'table', 'api'];
}

export function webDistributionDomainNames(env: DeployEnvironment): string[] {
  const keys: ServiceHostKey[] = env === 'prod' ? ['apex', 'www', 'table'] : ['www', 'table'];
  return keys.map((key) => hostFqdn(key, env));
}

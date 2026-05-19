#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import { LogRetentionAspect } from '../lib/aspects/log-retention-aspect.js';
import { parseDeployEnvironment, WORKLOAD_REGION } from '../lib/config/environment.js';
import { DEFAULT_ENV, PROJECT_NAME } from '../lib/constants.js';
import { AiBedrockStack } from '../lib/stacks/ai-bedrock-stack.js';
import { ApiStack } from '../lib/stacks/api-stack.js';
import { CertificateStack } from '../lib/stacks/certificate-stack.js';
import { PublicCanonStack } from '../lib/stacks/public-canon-stack.js';
import { SessionHandshakeStack } from '../lib/stacks/session-handshake-stack.js';
import { WebEdgeStack } from '../lib/stacks/web-edge-stack.js';

const app = new cdk.App();
cdk.Aspects.of(app).add(new LogRetentionAspect());

const envName = parseDeployEnvironment(
  (app.node.tryGetContext('env') as string | undefined) ?? DEFAULT_ENV,
);

const account = process.env.CDK_DEFAULT_ACCOUNT;
const workloadRegion = process.env.CDK_DEFAULT_REGION ?? WORKLOAD_REGION;

const workloadEnv: cdk.Environment = {
  ...(account ? { account } : {}),
  region: workloadRegion,
};

const amberStackProps = {
  env: workloadEnv,
  envName,
  description: `${PROJECT_NAME} infrastructure (${envName})`,
};

const certStack = new CertificateStack(app, `AmberCoffer-Cert-${envName}`, amberStackProps);

const webStack = new WebEdgeStack(app, `AmberCoffer-Web-${envName}`, {
  ...amberStackProps,
  cloudfrontCertificateArn: certStack.certificate.certificateArn,
});
webStack.addDependency(certStack);

const handshakeStack = new SessionHandshakeStack(
  app,
  `AmberCoffer-Handshake-${envName}`,
  amberStackProps,
);

new ApiStack(app, `AmberCoffer-Api-${envName}`, {
  ...amberStackProps,
  handshakeTable: handshakeStack.table,
  sessionSyncTable: handshakeStack.sessionSyncTable,
  sessionAuthSecret: handshakeStack.sessionAuthSecret,
});
// Api stack references handshake resources via props (no IoT dependency).

new PublicCanonStack(app, `AmberCoffer-Canon-${envName}`, amberStackProps);
new AiBedrockStack(app, `AmberCoffer-Bedrock-${envName}`, amberStackProps);

app.synth();

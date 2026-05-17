#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import { DEFAULT_ENV, PROJECT_NAME } from '../lib/constants.js';
import { AiBedrockStack } from '../lib/stacks/ai-bedrock-stack.js';
import { IotCoreStack } from '../lib/stacks/iot-core-stack.js';
import { PublicCanonStack } from '../lib/stacks/public-canon-stack.js';
import { SessionHandshakeStack } from '../lib/stacks/session-handshake-stack.js';

const app = new cdk.App();
const envName =
  (app.node.tryGetContext('env') as string | undefined) ?? DEFAULT_ENV;

const stackProps: cdk.StackProps = {
  env: {
    ...(process.env.CDK_DEFAULT_ACCOUNT
      ? { account: process.env.CDK_DEFAULT_ACCOUNT }
      : {}),
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-west-1',
  },
  description: `${PROJECT_NAME} infrastructure (${envName})`,
};

new IotCoreStack(app, `AmberCoffer-Iot-${envName}`, stackProps);
new SessionHandshakeStack(app, `AmberCoffer-Handshake-${envName}`, stackProps);
new PublicCanonStack(app, `AmberCoffer-Canon-${envName}`, stackProps);
new AiBedrockStack(app, `AmberCoffer-Bedrock-${envName}`, stackProps);

app.synth();

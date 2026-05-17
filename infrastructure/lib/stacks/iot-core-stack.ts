import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { PROJECT_NAME } from '../constants.js';

/** AWS IoT Core — MQTT broker for real-time tactical sync (placeholder). */
export class IotCoreStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('Project', PROJECT_NAME);
    cdk.Tags.of(this).add('Component', 'iot-core');

    // TODO: IoT policy, thing types, topic rules for amber-coffer/{campaignId}/...
  }
}

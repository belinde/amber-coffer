import { z } from 'zod';

import { campaignIdSchema, discordUserIdSchema, sessionIdSchema } from '../ids/schemas.js';

import { mqttMessageSchema } from './messages.schema.js';

export function syncEnvelopeSchema<T extends z.ZodTypeAny>(payloadSchema: T) {
  return z.object({
    v: z.literal(1),
    campaignId: campaignIdSchema,
    sessionId: sessionIdSchema.nullable(),
    senderRole: z.enum(['master', 'player']),
    senderId: discordUserIdSchema,
    seq: z.number().int().nonnegative(),
    timestamp: z.number().int().nonnegative(),
    payload: payloadSchema,
  });
}

export const syncEnvelopeMqttSchema = syncEnvelopeSchema(mqttMessageSchema);

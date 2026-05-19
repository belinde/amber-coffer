import type { SyncClientLike } from '../sync/types.js';

import type { SyncEnvelopeParsed } from './fixtures/demo-session.js';

export function injectEnvelope(
  client: SyncClientLike,
  topic: string,
  envelope: SyncEnvelopeParsed,
): void {
  client.publish(topic, JSON.stringify(envelope));
}

import { syncEnvelopeMqttSchema } from '@amber/shared';
import { describe, expect, it, beforeEach } from 'vitest';

import {
  buildSyncEnvelope,
  buildTabletopSnapshotPayload,
  tokensTopic,
} from '../../dev/fixtures/demo-session.js';
import { InMemorySyncClient } from '../../sync/in-memory-sync-client.js';

import { tabletopStore } from './store.js';

describe('tabletopStore.applyMqttMessage', () => {
  beforeEach(() => {
    tabletopStore.dispatch({ type: 'session.ended' });
  });

  it('applies tabletop.snapshot', () => {
    const payload = buildTabletopSnapshotPayload();
    tabletopStore.applyMqttMessage(payload);
    expect(tabletopStore.getState().tokens).toHaveLength(3);
    expect(tabletopStore.getState().activeMapId).toBe(payload.activeMapId);
    expect(tabletopStore.getState().maps).toHaveLength(1);
  });

  it('applies token.moved via mqtt client', () => {
    const client = new InMemorySyncClient();
    client.subscribe('tokens', (msg) => tabletopStore.applyMqttMessage(msg));

    const snapshot = buildTabletopSnapshotPayload();
    tabletopStore.applyMqttMessage(snapshot);
    const tokenId = snapshot.tokens[0]!.id;
    const envelope = buildSyncEnvelope({
      kind: 'token.moved',
      tokenId,
      mapId: snapshot.activeMapId!,
      position: { zone: 'bench', slot: 1 },
    });
    client.publish(tokensTopic(), JSON.stringify(envelope));

    const moved = tabletopStore.getState().tokens.find((t) => t.id === tokenId);
    expect(moved?.position).toEqual({ zone: 'bench', slot: 1 });
  });

  it('resets on session.ended', () => {
    tabletopStore.applyMqttMessage(buildTabletopSnapshotPayload());
    tabletopStore.applyMqttMessage({
      kind: 'session.ended',
      sessionId: buildTabletopSnapshotPayload().sessionId,
    });
    expect(tabletopStore.getState().tokens).toHaveLength(0);
  });
});

describe('demo snapshot envelope', () => {
  it('passes sync envelope schema', () => {
    const envelope = buildSyncEnvelope(buildTabletopSnapshotPayload());
    expect(() => syncEnvelopeMqttSchema.parse(envelope)).not.toThrow();
  });
});

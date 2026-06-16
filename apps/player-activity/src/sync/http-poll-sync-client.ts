import type { CampaignId, MqttMessage, SessionId, SyncChannel, Token } from '@amber/shared';
import { buildSyncTopic, mqttMessageSchema } from '@amber/shared';

import {
  getSessionSyncState,
  postSessionSyncEvents,
  SessionSyncError,
} from '../api/session-sync.js';
import type { ApiUrlOptions } from '../config/api.js';

import type { SyncMessageHandler } from './in-memory-sync-client.js';
import type { SyncClientLike } from './types.js';

export type HttpPollSyncCallbacks = {
  onPollError?: (error: Error) => void;
  onSessionEnded?: () => void;
  onFirstSnapshot?: () => void;
  onCampaignName?: (name: string) => void;
};

/**
 * HTTP polling sync transport for Discord Activity (GET state every pollIntervalMs).
 */
export class HttpPollSyncClient implements SyncClientLike {
  private readonly handlers = new Map<SyncChannel, Set<SyncMessageHandler>>();
  private sessionToken: string | null = null;
  private pollIntervalMs = 2000;
  private useDiscordProxy = false;
  private lastVersion = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private callbacks: HttpPollSyncCallbacks = {};
  private gotSnapshot = false;

  /**
   * Tracks optimistic token positions posted via postEvents() but not yet
   * confirmed by a server pendingEvent. Prevents snapshot clobbering.
   * postedAtVersion records the client's lastVersion at the time of posting,
   * enabling deterministic clearing once the server advances past that point.
   */
  private pendingMoves = new Map<
    Token['id'],
    { mapId: Token['mapId']; position: Token['position']; postedAtVersion: number }
  >();

  subscribe(channel: SyncChannel, handler: SyncMessageHandler): () => void {
    const set = this.handlers.get(channel) ?? new Set();
    set.add(handler);
    this.handlers.set(channel, set);
    return () => {
      set.delete(handler);
    };
  }

  buildTopic(campaignId: CampaignId, sessionId: SessionId | null, channel: SyncChannel): string {
    return buildSyncTopic(campaignId, sessionId, channel);
  }

  /** Dev-only: no-op (use InMemorySyncClient for local inject). */
  publish(_topic: string, _raw: string): void {
    // Production uplink uses postSessionSyncEvents via publishTokenMoved.
  }

  start(args: {
    sessionToken: string;
    pollIntervalMs: number;
    useDiscordProxy?: boolean;
    callbacks?: HttpPollSyncCallbacks;
  }): void {
    this.stop();
    this.sessionToken = args.sessionToken;
    this.pollIntervalMs = args.pollIntervalMs;
    this.useDiscordProxy = args.useDiscordProxy ?? false;
    this.callbacks = args.callbacks ?? {};
    this.lastVersion = 0;
    this.gotSnapshot = false;
    this.pendingMoves.clear();
    this.running = true;
    void this.pollOnce();
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async postEvents(events: MqttMessage[], options?: ApiUrlOptions): Promise<void> {
    const token = this.sessionToken;
    if (!token) {
      throw new SessionSyncError(0, 'sync_not_started');
    }

    // Track optimistic moves for token.move.request events
    for (const event of events) {
      if (event.kind === 'token.move.request') {
        this.pendingMoves.set(event.tokenId, {
          mapId: event.mapId,
          position: event.requestedPosition,
          postedAtVersion: this.lastVersion,
        });
      }
    }

    await postSessionSyncEvents(token, events, {
      useDiscordProxy: options?.useDiscordProxy ?? this.useDiscordProxy,
    });
  }

  private scheduleNext(): void {
    if (!this.running) {
      return;
    }
    this.pollTimer = setTimeout(() => {
      void this.pollOnce();
    }, this.pollIntervalMs);
  }

  private async pollOnce(): Promise<void> {
    if (!this.running || !this.sessionToken) {
      return;
    }

    const apiOptions: ApiUrlOptions = { useDiscordProxy: this.useDiscordProxy };

    try {
      const result = await getSessionSyncState(this.sessionToken, {
        ...apiOptions,
        sinceVersion: this.lastVersion,
      });

      if (result.status === 304) {
        this.scheduleNext();
        return;
      }

      const { state } = result;
      if (state.sessionEnded) {
        this.pendingMoves.clear();
        this.callbacks.onSessionEnded?.();
        this.stop();
        return;
      }

      // 1. Process pendingEvents — clear confirmed optimistic moves
      // Events are now versioned envelopes { eventVersion, message }
      let maxEventVersion = 0;
      for (const event of state.pendingEvents) {
        if (event.eventVersion > maxEventVersion) {
          maxEventVersion = event.eventVersion;
        }

        // Clear optimistic move when server confirms a token.moved
        if (event.message.kind === 'token.moved') {
          this.pendingMoves.delete(event.message.tokenId);
        }
      }

      // Advance lastVersion to the maximum of state.version and the highest eventVersion seen
      this.lastVersion = Math.max(this.lastVersion, state.version, maxEventVersion);

      // Clear stale optimistic moves by version: if the server has advanced past
      // the point where the move was posted, it is either reflected or superseded
      for (const [tokenId, entry] of this.pendingMoves) {
        if (this.lastVersion > entry.postedAtVersion) {
          this.pendingMoves.delete(tokenId);
        }
      }

      // 2. Apply snapshot if present (base state, possibly stale)
      if (state.snapshot) {
        const snapshot = mqttMessageSchema.parse(state.snapshot);
        this.dispatch('snapshot', snapshot);
        if (!this.gotSnapshot) {
          this.gotSnapshot = true;
          this.callbacks.onFirstSnapshot?.();
        }
        // Extract campaign name from snapshot if available
        if (snapshot.kind === 'tabletop.snapshot' && snapshot.campaignName) {
          this.callbacks.onCampaignName?.(snapshot.campaignName);
        }
      }

      // 3. Apply pendingEvents on top of snapshot — each event dispatched exactly once
      for (const event of state.pendingEvents) {
        this.dispatchEvent(event.message);
      }

      // 4. Re-overlay any remaining optimistic moves not yet confirmed
      if (this.pendingMoves.size > 0) {
        for (const [tokenId, { mapId, position }] of this.pendingMoves) {
          this.dispatchEvent({
            kind: 'token.moved',
            tokenId,
            mapId,
            position,
          });
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('sync_poll_failed');
      this.callbacks.onPollError?.(error);
    }

    this.scheduleNext();
  }

  private dispatch(channel: SyncChannel, payload: MqttMessage): void {
    const handlers = this.handlers.get(channel);
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      handler(payload);
    }
  }

  /**
   * Routes a parsed MqttMessage to the appropriate channel based on its kind.
   * Used for dispatching pendingEvents and optimistic move re-overlays.
   */
  private dispatchEvent(payload: MqttMessage): void {
    const channel = this.channelForKind(payload.kind);
    if (channel) {
      this.dispatch(channel, payload);
    }
  }

  private channelForKind(kind: MqttMessage['kind']): SyncChannel | null {
    switch (kind) {
      case 'token.moved':
      case 'token.move.request':
      case 'token.created':
      case 'token.removed':
        return 'tokens';
      case 'map.activated':
      case 'map.updated':
        return 'maps';
      case 'fog.revealed':
      case 'fog.hidden':
        return 'fog';
      case 'handout.shown':
      case 'handout.hidden':
        return 'handouts';
      case 'entity.updated':
        return 'entities';
      case 'session.handshake':
      case 'session.heartbeat':
      case 'session.ended':
        return 'control';
      case 'tabletop.snapshot':
        return 'snapshot';
      default:
        return null;
    }
  }
}

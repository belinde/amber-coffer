import type { CampaignId, MqttMessage, SessionId, SyncChannel } from '@amber/shared';
import { mqttMessageSchema } from '@amber/shared';
import { buildSyncTopic } from '@amber/shared';

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
      if (state.version > this.lastVersion) {
        this.lastVersion = state.version;
      }

      if (state.sessionEnded) {
        this.callbacks.onSessionEnded?.();
        this.stop();
        return;
      }

      if (state.snapshot) {
        const snapshot = mqttMessageSchema.parse(state.snapshot);
        this.dispatch('snapshot', snapshot);
        if (!this.gotSnapshot) {
          this.gotSnapshot = true;
          this.callbacks.onFirstSnapshot?.();
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
}

/**
 * Bug Condition Exploration Tests
 *
 * These tests are EXPECTED TO FAIL on unfixed code. Failure confirms the bugs exist.
 * DO NOT fix the code or the tests when they fail.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Map, MqttMessage, SessionSyncStateResponse, Token } from '@amber/shared';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { tabletopStore } from '../features/tabletop/store.js';

// Mock the session-sync API module so pollOnce() uses our fake responses
vi.mock('../api/session-sync.js', () => ({
  getSessionSyncState: vi.fn(),
  postSessionSyncEvents: vi.fn(),
  SessionSyncError: class SessionSyncError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message?: string) {
      super(message ?? code);
      this.name = 'SessionSyncError';
      this.status = status;
      this.code = code;
    }
  },
}));

// --- Test fixtures ---

const mapId = '11111111-1111-7111-8111-111111111111' as Token['mapId'];
const tokenId = 'a1a1a1a1-a1a1-7111-8111-a1a1a1a1a1a1' as Token['id'];
const campaignId = 'cccccccc-cccc-7ccc-8ccc-cccccccccccc' as Map['campaignId'];
const sessionId = 'eeeeeeee-eeee-7eee-8eee-eeeeeeeeeeee' as any;

const sampleMap: Map = {
  id: mapId,
  campaignId,
  name: 'Test Map',
  imagePath: '',
  backgroundPublicPath: '/session-assets/forest.webp',
  widthPx: 1920,
  heightPx: 1080,
  gridSizePx: 80,
  gridCols: 24,
  gridRows: 18,
  benchSlots: 8,
  createdAt: 0,
  updatedAt: 0,
  version: 1,
};

const sampleToken: Token = {
  id: tokenId,
  mapId,
  entityKind: 'character',
  entityId: 'char-1',
  sessionId: null,
  displayName: null,
  position: { zone: 'board', xCell: 2, yCell: 3 },
  visibleToPlayers: true,
  controlledByPlayerDiscordId: null,
  createdAt: 0,
  updatedAt: 0,
  version: 1,
};

beforeEach(() => {
  // Reset store to initial state before each test
  tabletopStore.applyMqttMessage({
    kind: 'session.ended',
    sessionId,
  });
  vi.clearAllMocks();
});

describe('Bug Condition Exploration — pendingEvents ignored (Req 1.1, 1.2)', () => {
  /**
   * **Validates: Requirements 1.1, 1.2**
   *
   * Test 1: Mock getSessionSyncState to return pendingEvents with a token.moved event.
   * Assert that after pollOnce(), the store contains the updated position.
   * EXPECTED TO FAIL on unfixed code — pendingEvents are ignored by pollOnce().
   */
  it('should apply pendingEvents token.moved from poll response', async () => {
    const { getSessionSyncState } = await import('../api/session-sync.js');
    const mockGetState = getSessionSyncState as Mock;

    // Mock returns pendingEvents with token.moved but no snapshot
    mockGetState.mockResolvedValue({
      status: 200,
      state: {
        version: 1,
        snapshot: null,
        sessionEnded: false,
        pendingEvents: [
          {
            eventVersion: 1,
            message: {
              kind: 'token.moved',
              tokenId,
              mapId,
              position: { zone: 'board', xCell: 5, yCell: 3 },
            },
          },
        ],
      } satisfies SessionSyncStateResponse,
    });

    // Import HttpPollSyncClient after mock is set up
    const { HttpPollSyncClient } = await import('./http-poll-sync-client.js');
    const client = new HttpPollSyncClient();

    // Subscribe the store to handle dispatched messages on all relevant channels
    client.subscribe('snapshot', (msg) => tabletopStore.applyMqttMessage(msg));
    client.subscribe('tokens', (msg) => tabletopStore.applyMqttMessage(msg));

    // Set up initial state with the token at (2,3)
    tabletopStore.applyMqttMessage({
      kind: 'tabletop.snapshot',
      campaignName: null,
      sessionId,
      activeMapId: mapId,
      maps: [sampleMap],
      tokens: [sampleToken],
      tokenLabels: {},
      tokenNames: {},
      tokenPortraitUrls: {},
      visibleHandouts: [],
      snapshotAt: 0,
    });

    // Verify initial position
    expect(tabletopStore.getState().tokens[0]?.position).toEqual({
      zone: 'board',
      xCell: 2,
      yCell: 3,
    });

    // Start the client — pollOnce() fires immediately
    client.start({
      sessionToken: 'test-token',
      pollIntervalMs: 99999,
      useDiscordProxy: false,
    });

    // Wait for the async pollOnce to complete
    await vi.waitFor(() => {
      expect(mockGetState).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 50));

    client.stop();

    // Assert: the token should now be at (5,3) from the pendingEvents
    const state = tabletopStore.getState();
    const token = state.tokens.find((t) => t.id === tokenId);
    expect(token?.position).toEqual({ zone: 'board', xCell: 5, yCell: 3 });
  });
});

describe('Bug Condition Exploration — map.updated unhandled (Req 1.3)', () => {
  /**
   * **Validates: Requirements 1.3**
   *
   * Test 2: Call tabletopStore.applyMqttMessage with kind:'map.updated'.
   * Assert state.maps contains the updated map.
   * EXPECTED TO FAIL on unfixed code — map.updated is unhandled in applyMqttMessage.
   */
  it('should handle map.updated message and update state.maps', () => {
    // Set up initial state with the sample map
    tabletopStore.applyMqttMessage({
      kind: 'tabletop.snapshot',
      campaignName: null,
      sessionId,
      activeMapId: mapId,
      maps: [sampleMap],
      tokens: [],
      tokenLabels: {},
      tokenNames: {},
      tokenPortraitUrls: {},
      visibleHandouts: [],
      snapshotAt: 0,
    });

    // Verify initial background
    expect(tabletopStore.getState().maps[0]?.backgroundPublicPath).toBe(
      '/session-assets/forest.webp',
    );

    // Apply a map.updated message with new background
    const updatedMap: Map = {
      ...sampleMap,
      backgroundPublicPath: '/session-assets/dungeon.webp',
      updatedAt: 100,
      version: 2,
    };

    tabletopStore.applyMqttMessage({
      kind: 'map.updated',
      map: updatedMap,
    });

    // Assert: state.maps should contain the updated map
    const state = tabletopStore.getState();
    const mapInState = state.maps.find((m) => m.id === mapId);
    expect(mapInState?.backgroundPublicPath).toBe('/session-assets/dungeon.webp');
  });
});

describe('Bug Condition Exploration — CSS token height defeats aspect-ratio (Req 1.4)', () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * Test 3: Verify CSS .tabletop-token has explicit height declaration that defeats
   * aspect-ratio: 1 on portrait grids.
   * EXPECTED TO FAIL on unfixed code — height IS present, defeating aspect-ratio.
   */
  it('should NOT have explicit height on .tabletop-token that defeats aspect-ratio', () => {
    const cssPath = path.resolve(__dirname, '../../../../packages/ui/src/styles/tabletop.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Extract the .tabletop-token rule (not --bench variant)
    const tokenRuleMatch = cssContent.match(/\.tabletop-token\s*\{([^}]+)\}/);
    expect(tokenRuleMatch).not.toBeNull();

    const tokenRuleBody = tokenRuleMatch![1]!;

    // The bug: .tabletop-token has `height: calc(100% * var(--token-fill, 0.9))`
    // which defeats `aspect-ratio: 1` on non-square grid cells.
    // After fix, there should be NO explicit height (only width + aspect-ratio).
    const hasExplicitHeight = /\bheight\s*:\s*calc\(/.test(tokenRuleBody);

    // This assertion will FAIL on unfixed code (height IS present)
    expect(hasExplicitHeight).toBe(false);
  });

  it('should NOT have explicit height on .tabletop-ghost that defeats aspect-ratio', () => {
    const cssPath = path.resolve(__dirname, '../../../../packages/ui/src/styles/tabletop.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Extract the .tabletop-ghost rule (not --bench variant)
    const ghostRuleMatch = cssContent.match(/\.tabletop-ghost\s*\{([^}]+)\}/);
    expect(ghostRuleMatch).not.toBeNull();

    const ghostRuleBody = ghostRuleMatch![1]!;

    const hasExplicitHeight = /\bheight\s*:\s*calc\(/.test(ghostRuleBody);

    // This assertion will FAIL on unfixed code (height IS present)
    expect(hasExplicitHeight).toBe(false);
  });
});

describe('Bug Condition Exploration — snapshot clobbers pendingEvents (Req 1.1)', () => {
  /**
   * **Validates: Requirements 1.1**
   *
   * Test 4: Set local state with token at (5,3), then apply a snapshot with token at (2,3)
   * while a pendingEvents entry confirms (5,3). Assert final position is (5,3).
   * EXPECTED TO FAIL on unfixed code — snapshot clobbers the confirmed position.
   */
  it('should not clobber confirmed position from pendingEvents with stale snapshot', async () => {
    const { getSessionSyncState } = await import('../api/session-sync.js');
    const mockGetState = getSessionSyncState as Mock;

    // Mock returns a STALE snapshot with token at (2,3)
    // BUT pendingEvents confirms the move to (5,3)
    mockGetState.mockResolvedValue({
      status: 200,
      state: {
        version: 2,
        snapshot: {
          kind: 'tabletop.snapshot',
          campaignName: null,
          sessionId,
          activeMapId: mapId,
          maps: [sampleMap],
          tokens: [{ ...sampleToken, position: { zone: 'board', xCell: 2, yCell: 3 } }],
          tokenLabels: {},
          tokenNames: {},
          tokenPortraitUrls: {},
          visibleHandouts: [],
          snapshotAt: 1,
        },
        sessionEnded: false,
        pendingEvents: [
          {
            eventVersion: 2,
            message: {
              kind: 'token.moved',
              tokenId,
              mapId,
              position: { zone: 'board', xCell: 5, yCell: 3 },
            },
          },
        ],
      } satisfies SessionSyncStateResponse,
    });

    const { HttpPollSyncClient } = await import('./http-poll-sync-client.js');
    const client = new HttpPollSyncClient();

    // Track what messages are dispatched to the snapshot channel
    const snapshotMessages: MqttMessage[] = [];
    client.subscribe('snapshot', (msg) => {
      snapshotMessages.push(msg);
      tabletopStore.applyMqttMessage(msg);
    });
    client.subscribe('tokens', (msg) => tabletopStore.applyMqttMessage(msg));

    // Set up initial state with token at (5,3) — simulating an optimistic local move
    tabletopStore.applyMqttMessage({
      kind: 'tabletop.snapshot',
      campaignName: null,
      sessionId,
      activeMapId: mapId,
      maps: [sampleMap],
      tokens: [{ ...sampleToken, position: { zone: 'board', xCell: 5, yCell: 3 } }],
      tokenLabels: {},
      tokenNames: {},
      tokenPortraitUrls: {},
      visibleHandouts: [],
      snapshotAt: 0,
    });

    // Verify local state has token at (5,3)
    expect(tabletopStore.getState().tokens[0]?.position).toEqual({
      zone: 'board',
      xCell: 5,
      yCell: 3,
    });

    // Start the client — pollOnce() fires immediately
    client.start({
      sessionToken: 'test-token',
      pollIntervalMs: 99999,
      useDiscordProxy: false,
    });

    // Wait for poll to complete
    await vi.waitFor(() => {
      expect(mockGetState).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 50));

    client.stop();

    // Verify the mock was called and snapshot was dispatched
    expect(mockGetState).toHaveBeenCalledTimes(1);
    expect(snapshotMessages).toHaveLength(1);

    // On unfixed code: token is at (2,3) because snapshot clobbers and pendingEvents ignored
    // On fixed code: token is at (5,3) because pendingEvents applied after snapshot
    const state = tabletopStore.getState();
    const token = state.tokens.find((t) => t.id === tokenId);
    expect(token?.position).toEqual({ zone: 'board', xCell: 5, yCell: 3 });
  });
});

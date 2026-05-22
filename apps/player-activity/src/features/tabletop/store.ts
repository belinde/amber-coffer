import type { MqttMessage } from '@amber/shared';
import type { TabletopAction, TabletopState } from '@amber/tabletop-engine';
import { initialTabletopState, tabletopReducer } from '@amber/tabletop-engine';
import { useSyncExternalStore } from 'react';

/**
 * Tiny pub/sub store for the Player Activity tabletop state.
 * Avoids adding Zustand/Redux as dependencies until we need their features.
 */
class TabletopStore {
  private state: TabletopState = initialTabletopState;
  private readonly listeners = new Set<() => void>();
  private readonly sessionEndedListeners = new Set<() => void>();

  getState = (): TabletopState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  subscribeSessionEnded = (listener: () => void): (() => void) => {
    this.sessionEndedListeners.add(listener);
    return () => {
      this.sessionEndedListeners.delete(listener);
    };
  };

  dispatch(action: TabletopAction): void {
    const next = tabletopReducer(this.state, action);
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  /**
   * Translates an MQTT envelope payload into a tabletop action and applies it.
   * Unhandled `kind`s are ignored (the message simply does not belong to this slice of state).
   */
  applyMqttMessage(payload: MqttMessage): void {
    switch (payload.kind) {
      case 'tabletop.snapshot':
        this.dispatch({
          type: 'snapshot.applied',
          activeMapId: payload.activeMapId,
          maps: payload.maps,
          tokens: payload.tokens,
          tokenLabels: payload.tokenLabels,
          tokenNames: payload.tokenNames,
          visibleHandouts: payload.visibleHandouts,
        });
        return;
      case 'map.activated':
        this.dispatch({ type: 'map.activated', mapId: payload.mapId });
        return;
      case 'token.created':
        this.dispatch({ type: 'token.created', token: payload.token });
        return;
      case 'token.moved':
        this.dispatch({
          type: 'token.moved',
          tokenId: payload.tokenId,
          position: payload.position,
        });
        return;
      case 'token.removed':
        this.dispatch({ type: 'token.removed', tokenId: payload.tokenId });
        return;
      case 'map.updated':
        this.dispatch({ type: 'map.updated', map: payload.map });
        return;
      case 'handout.shown':
        this.dispatch({ type: 'handout.shown', handout: payload.handout });
        return;
      case 'handout.hidden':
        this.dispatch({ type: 'handout.hidden', handoutId: payload.handoutId });
        return;
      case 'session.ended':
        this.dispatch({ type: 'session.ended' });
        for (const listener of this.sessionEndedListeners) listener();
        return;
      default:
        return;
    }
  }
}

export const tabletopStore = new TabletopStore();

export function useTabletopState(): TabletopState {
  return useSyncExternalStore(
    tabletopStore.subscribe,
    tabletopStore.getState,
    tabletopStore.getState,
  );
}

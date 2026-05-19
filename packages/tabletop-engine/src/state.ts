import type { Handout, Map, Token } from '@amber/shared';

type HandoutId = Handout['id'];
type MapId = Token['mapId'];
type TokenId = Token['id'];
type TokenPosition = Token['position'];

/**
 * Read-only tabletop state mirrored across master-app and player-activity.
 *
 * On the master-app this state is rebuilt from SQLite + invokes; on the player-activity
 * it is bootstrapped from a retained `tabletop.snapshot` MQTT message and then mutated
 * by incremental events (`token.created` / `token.moved` / ...).
 */
export type TabletopState = {
  activeMapId: MapId | null;
  maps: Map[];
  tokens: Token[];
  visibleHandouts: Handout[];
};

export const initialTabletopState: TabletopState = {
  activeMapId: null,
  maps: [],
  tokens: [],
  visibleHandouts: [],
};

export type TabletopAction =
  | {
      type: 'snapshot.applied';
      activeMapId: MapId | null;
      maps: Map[];
      tokens: Token[];
      visibleHandouts: Handout[];
    }
  | { type: 'map.activated'; mapId: MapId }
  | { type: 'token.created'; token: Token }
  | { type: 'token.moved'; tokenId: TokenId; position: TokenPosition }
  | { type: 'token.removed'; tokenId: TokenId }
  | { type: 'handout.shown'; handout: Handout }
  | { type: 'handout.hidden'; handoutId: HandoutId }
  | { type: 'session.ended' };

export function tabletopReducer(state: TabletopState, action: TabletopAction): TabletopState {
  switch (action.type) {
    case 'snapshot.applied':
      return {
        activeMapId: action.activeMapId,
        maps: action.maps,
        tokens: action.tokens,
        visibleHandouts: action.visibleHandouts,
      };
    case 'map.activated':
      return { ...state, activeMapId: action.mapId };
    case 'token.created':
      if (state.tokens.some((t) => t.id === action.token.id)) {
        return state;
      }
      return { ...state, tokens: [...state.tokens, action.token] };
    case 'token.moved':
      return {
        ...state,
        tokens: state.tokens.map((t) =>
          t.id === action.tokenId ? { ...t, position: action.position } : t,
        ),
      };
    case 'token.removed':
      return { ...state, tokens: state.tokens.filter((t) => t.id !== action.tokenId) };
    case 'handout.shown':
      if (state.visibleHandouts.some((h) => h.id === action.handout.id)) {
        return state;
      }
      return { ...state, visibleHandouts: [...state.visibleHandouts, action.handout] };
    case 'handout.hidden':
      return {
        ...state,
        visibleHandouts: state.visibleHandouts.filter((h) => h.id !== action.handoutId),
      };
    case 'session.ended':
      return initialTabletopState;
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}

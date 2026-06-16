# Bugfix Requirements Document

## Introduction

During a live tabletop session with 5 players in the Player Activity (Discord Activity, stateless tactical viewer syncing over HTTP polling every 2s), the table became unusable. As soon as players started moving their tokens, a self-sustaining refresh loop kicked off across all clients: tokens kept moving on their own, with no human interaction, and the layout never settled — the reporter observed continuous autonomous movement for at least an hour.

This is a **non-convergence / feedback loop** defect: the multi-client sync never reaches a stable state under concurrent moves. It is distinct from the previously fixed "stale snapshot clobber" bug (spec `tabletop-multi-user-bugs`), where a single token reverted once to an old position on the next poll. That earlier fix introduced optimistic move tracking (`pendingMoves`) and pending-event re-overlay in `HttpPollSyncClient`; the bug addressed here is the perpetual replay/echo that emerges when those mechanisms interact with concurrent multi-player activity and a shared, never-drained server event backlog. The fix must target the loop and convergence, **not** re-fix the stale-snapshot revert.

The relevant pipeline spans the player poll client (`apps/player-activity/src/sync/http-poll-sync-client.ts`), the tabletop store (`apps/player-activity/src/features/tabletop/store.ts`), the engine reducer (`packages/tabletop-engine/src/state.ts`), the shared sync contracts (`packages/shared/src/sync/`), and the server-side sync store (`infrastructure/lambdas/shared/session-sync-store.ts`).

## Bug Analysis

### Current Behavior (Defect)

What currently happens once multiple players begin moving tokens: events are reprocessed indefinitely and token positions never converge, producing continuous autonomous movement.

1.1 WHEN two or more players move their tokens during the same session THEN the system replays the entire shared backlog of recent move events on every poll cycle, re-applying moves that were already applied so tokens repeatedly jump to earlier positions

1.2 WHEN any player posts a move THEN the system advances the session version, which causes every other client's poll to return the full state (never the unchanged fast-path), forcing all clients to re-apply the whole event backlog again — so continuous player activity guarantees continuous reprocessing

1.3 WHEN a player's move is recorded as an optimistic in-flight move but is not matched by a corresponding confirming event within the version window the client observes THEN the client re-applies that optimistic move on top of every subsequent poll indefinitely, so the token oscillates between the optimistic position and the snapshot/backlog position

1.4 WHEN move events are delivered to clients THEN the system never acknowledges, drains, or version-filters them per client, so the same events are returned and re-applied on every poll until they age out of the fixed-size backlog window

1.5 WHEN 5 players are active concurrently THEN tokens continue to move with no human input and the table never reaches a stable layout, remaining in a perpetual refresh loop (observed for at least an hour)

### Expected Behavior (Correct)

What should happen instead: every move is applied at most once per client, optimistic state is reconciled deterministically, and the system converges to a single stable layout once input stops.

2.1 WHEN two or more players move their tokens during the same session THEN the system SHALL apply each distinct move event at most once per client, so already-applied moves are never replayed and tokens do not jump to earlier positions

2.2 WHEN the session version advances because some client posted a move THEN the system SHALL deliver to each client only the events newer than what that client has already processed, so a version change does not by itself trigger re-application of previously applied events

2.3 WHEN a player has an optimistic in-flight move THEN the system SHALL clear that optimistic move deterministically once server state at or after the move's version reflects it (or supersedes it), so the client never re-applies the optimistic move indefinitely

2.4 WHEN move events have been delivered to clients THEN the system SHALL acknowledge, drain, or version-filter them so that a given event is not redundantly returned and re-applied on later polls

2.5 WHEN players stop interacting THEN the system SHALL converge so that all clients display a single, identical, stable token layout with no further autonomous movement

### Unchanged Behavior (Regression Prevention)

Existing behavior that must be preserved — including the corrections shipped by the prior `tabletop-multi-user-bugs` fix.

3.1 WHEN a single player moves a token THEN the system SHALL CONTINUE TO apply the optimistic local update immediately and reflect the confirmed server position afterward, without the token reverting to a stale position on the next poll

3.2 WHEN multiple players each make a distinct move that does not trigger the loop THEN the system SHALL CONTINUE TO propagate each move exactly once to all clients so every client sees the correct final positions

3.3 WHEN a client joins or reconnects and receives a full snapshot with no in-flight optimistic moves THEN the system SHALL CONTINUE TO replace the entire tabletop state with that snapshot

3.4 WHEN no new version is available since a client's last poll THEN the system SHALL CONTINUE TO take the unchanged-state fast-path without re-applying any events

3.5 WHEN the GM changes or activates a map (`map.updated` / `map.activated`) THEN the system SHALL CONTINUE TO reflect the change on player clients as it does today

3.6 WHEN the session ends THEN the system SHALL CONTINUE TO reset tabletop state to initial and notify session-ended listeners

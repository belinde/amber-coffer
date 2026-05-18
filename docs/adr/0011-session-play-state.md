---
title: Session play state vs pipeline status
status: accepted
---

# ADR 0011 — Session play state vs pipeline status

## Context

`Session.status` tracks the **post-session audio/STT/canone pipeline** (`planned` → `recording` → `recorded` → … → `published`). The product also needs an explicit **table phase** for the GM: preparation before play, live play at the table, and post-session processing UI.

Mixing both concerns in one enum made the session detail page show recording/transcription controls during preparation and prevented global UX such as locking campaign switch during live play.

## Decision

Add `Session.playState: 'preparing' | 'live' | 'ended'`:

- **`preparing`**: default on create; prep UI (pins, notes, vault links).
- **`live`**: set by `session_begin_play`; at most **one** live session per campaign (partial unique index on SQLite).
- **`ended`**: set by `session_end_play`; post-session workflow UI. Stopping active Discord recording is part of end play.

`Session.status` remains the pipeline enum. `startedAt` / `endedAt` are set by begin/end play; manual edits only via the collapsed «Edit details» form.

UI phase `preparing | live | post` is derived in the renderer (`resolveSessionUiPhase`): `post` when `playState === 'ended'` or legacy rows already in `recorded+` pipeline status.

## Consequences

- New migration column `play_state` and Tauri commands `session_begin_play`, `session_end_play`.
- `ActiveSessionContext` drives sidebar «Return to session» and disables campaign switching while live.
- Import/migrate infers `play_state` from `ended_at` when present.

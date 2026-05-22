# Bugfix Requirements Document

## Introduction

Investigation of the reported late-joining player transcription timing issue revealed that the core recording and transcription pipeline is correct. The bug was only reproducible when the one-off repair tool (`tools/fix-session-recording-once.mjs`) was used to consolidate a corrupted session — that tool collapsed per-chunk timing into a single offset per user. Since the repair tool was a use-once utility for a specific incident and is no longer needed, it should be deleted from the repository. The production pipeline (recording bot → v2 manifest with per-chunk offsets → transcription sidecar) correctly handles late-joining players.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the one-off repair tool `tools/fix-session-recording-once.mjs` exists in the repository THEN the system carries dead code that could be mistakenly run again, potentially corrupting session timing

### Expected Behavior (Correct)

2.1 WHEN the repository is cleaned up THEN the system SHALL NOT contain the one-off repair tool `tools/fix-session-recording-once.mjs` since it is no longer needed and its consolidation logic destroys per-chunk timing

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a player joins late and the recording bot creates chunks with `sessionOffsetMs = Date.now() - sessionStartedAt` THEN the system SHALL CONTINUE TO record accurate per-chunk offsets in the v2 manifest

3.2 WHEN the transcription sidecar processes a v2 manifest with individual chunk entries THEN the system SHALL CONTINUE TO correctly apply each chunk's `session_offset_s` to whisper-relative timestamps

3.3 WHEN an ogg file is smaller than MIN_OGG_BYTES (256 bytes) THEN the system SHALL CONTINUE TO discard it as an empty stub without affecting the timing of remaining valid chunks

3.4 WHEN multiple speakers' segments are merged into the final transcript THEN the system SHALL CONTINUE TO sort all segments chronologically by absolute start time regardless of speaker

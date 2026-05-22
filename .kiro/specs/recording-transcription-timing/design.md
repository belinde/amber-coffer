# Recording Transcription Timing Bugfix Design

## Overview

The reported late-joining player transcription timing issue was traced to the one-off repair tool `tools/fix-session-recording-once.mjs`. This tool consolidates per-user chunks into a single `track.ogg` per user, collapsing the v2 manifest to one chunk entry per user with only the earliest offset preserved. This destroys the per-chunk `sessionOffsetMs` timing that the transcription sidecar relies on to place whisper-relative timestamps into session-absolute time.

The production pipeline (`record.ts` → v2 manifest → `transcribe.py`) is correct and handles late-joining players properly. The fix is to delete the repair tool and add regression tests confirming the pipeline's correctness.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — running the one-off repair tool on a session with multiple per-user chunks, which consolidates them into a single track and destroys individual chunk offsets
- **Property (P)**: The desired behavior — per-chunk `sessionOffsetMs` values are preserved in the manifest and correctly applied during transcription so that late-joining speakers' segments appear at the right absolute time
- **Preservation**: The existing recording pipeline (`record.ts`), transcription sidecar (`transcribe.py`), and segment merge logic (`merge-transcript-segments.ts`) must continue to work unchanged
- **sessionOffsetMs**: Milliseconds from session `startedAt` when a chunk began recording, computed as `Date.now() - sessionStartedAt` in `record.ts`
- **session_offset_s**: The Python-side equivalent (`sessionOffsetMs / 1000.0`), added to whisper-relative segment timestamps to produce session-absolute times
- **v2 manifest**: `RecordingManifestV2` with a `chunks[]` array where each entry carries its own `sessionOffsetMs` and `durationMs`
- **MIN_OGG_BYTES**: 256-byte threshold below which an Ogg file is considered an empty stub and discarded

## Bug Details

### Bug Condition

The bug manifests when the one-off repair tool `tools/fix-session-recording-once.mjs` is run on a session directory. The tool concatenates all per-user chunk files into a single `track.ogg`, then rewrites the manifest with one chunk entry per user using only the earliest offset. All subsequent chunk offsets are lost.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input of type SessionDirectory
  OUTPUT: boolean

  RETURN repairToolExists('tools/fix-session-recording-once.mjs')
         AND input.manifest.version == 2
         AND input.manifest.chunks.length > countDistinctUsers(input.manifest.chunks)
         AND repairToolWasExecuted(input.sessionDir)
END FUNCTION
```

### Examples

- **Late joiner lost**: User A starts at offset 0ms, User B joins at offset 300000ms (5 min late) with 3 chunks. After repair, User B's single consolidated track has offset 0ms (from User A's first chunk logic) or the earliest of B's offsets, but all of B's subsequent chunk offsets are gone. Transcription places B's speech starting at the wrong absolute time.
- **Multi-chunk user collapsed**: User A has chunks at offsets [0, 120000, 240000]. After repair, one `track.ogg` with offset 0 — whisper processes the concatenated audio as if it all started at time 0, placing segments from minute 4 at minute 2.
- **Correct pipeline (no repair tool)**: User B joins 5 minutes late, gets chunks at offsets [300000, 360000, 420000]. Transcription sidecar processes each chunk independently, adding the correct `session_offset_s` to whisper-relative timestamps. Final segments are correctly placed at absolute session time.
- **Edge case — single chunk per user**: Repair tool produces identical output to the original manifest (no timing loss), but the concatenation step is still unnecessary overhead.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- The recording bot (`record.ts`) must continue to create per-user chunk files with correct `sessionOffsetMs = Date.now() - sessionStartedAt`
- The v2 manifest schema must continue to validate chunks with `sessionOffsetMs`, `durationMs`, `codec`, `sampleRate`, and `channels` fields
- The transcription sidecar must continue to iterate v2 manifest chunks, applying `sessionOffsetMs / 1000.0` as `session_offset_s` to whisper-relative timestamps
- The segment merge logic must continue to sort all segments chronologically by absolute `start` time
- Ogg files smaller than MIN_OGG_BYTES (256) must continue to be discarded as empty stubs
- The manifest must continue to support reconnect-safe recording (multiple chunks per user with independent offsets)

**Scope:**
All inputs that do NOT involve running the repair tool should be completely unaffected by this fix. This includes:

- Normal recording sessions (any number of participants, any join timing)
- Transcription of sessions with correct v2 manifests
- Segment merging and chronological sorting
- Stub file filtering (MIN_OGG_BYTES threshold)

## Hypothesized Root Cause

Based on the bug description, the root cause is definitively identified:

1. **Consolidation destroys per-chunk timing**: The repair tool's `concatOggFiles()` merges all per-user chunks into one `track.ogg`, then writes a manifest with a single chunk entry per user. The `sessionOffsetMs` for that entry is taken from the earliest chunk only — all subsequent offsets are lost.

2. **Whisper processes concatenated audio as single stream**: When the transcription sidecar receives a single chunk with offset X, it adds X to all whisper-relative timestamps. But the concatenated audio contains speech from multiple time windows, so segments from later chunks get incorrect absolute timestamps (too early).

3. **Dead code risk**: The tool remains in the repository and could be mistakenly run again on future sessions, re-introducing the timing corruption.

## Correctness Properties

Property 1: Bug Condition - Repair Tool Removal

_For any_ repository state after the fix is applied, the one-off repair tool `tools/fix-session-recording-once.mjs` SHALL NOT exist, eliminating the possibility of running it and destroying per-chunk timing.

**Validates: Requirements 2.1**

Property 2: Preservation - Per-Chunk Offset Recording

_For any_ recording session where a player joins at time T after session start, the recording bot SHALL produce chunks with `sessionOffsetMs` equal to `T` (within debounce tolerance), preserving accurate per-chunk timing in the v2 manifest.

**Validates: Requirements 3.1**

Property 3: Preservation - Transcription Offset Application

_For any_ v2 manifest with multiple chunks having distinct `sessionOffsetMs` values, the transcription sidecar SHALL apply each chunk's `session_offset_s` to whisper-relative timestamps independently, producing session-absolute segment times that reflect actual speaking moments.

**Validates: Requirements 3.2**

Property 4: Preservation - Empty Stub Filtering

_For any_ Ogg file smaller than MIN_OGG_BYTES (256 bytes), the recording pipeline SHALL discard it without affecting the timing or presence of remaining valid chunks in the manifest.

**Validates: Requirements 3.3**

Property 5: Preservation - Chronological Segment Merge

_For any_ set of transcript segments from multiple speakers, the merge function SHALL sort all segments by absolute `start` time regardless of speaker identity, producing a chronologically ordered transcript.

**Validates: Requirements 3.4**

## Fix Implementation

### Changes Required

**File**: `tools/fix-session-recording-once.mjs`

**Action**: Delete the file entirely.

**Specific Changes**:

1. **Delete repair tool**: Remove `tools/fix-session-recording-once.mjs` from the repository. This is the only code change required for the fix itself.

2. **No production code changes**: The recording bot, transcription sidecar, manifest schema, and merge logic are all correct and require no modifications.

3. **Add regression tests**: Write tests that validate the pipeline's correctness for late-joining players, ensuring the bug condition cannot be reintroduced by future code changes.

## Testing Strategy

### Validation Approach

The testing strategy focuses on regression prevention. Since the production pipeline is already correct, we confirm its behavior with targeted tests and verify the repair tool is gone.

### Exploratory Bug Condition Checking

**Goal**: Demonstrate that the repair tool's consolidation logic destroys per-chunk timing, confirming the root cause analysis before deletion.

**Test Plan**: Analyze the repair tool's output given a multi-chunk manifest to show timing loss. This is a conceptual verification — the tool's behavior is clear from code review.

**Test Cases**:

1. **Multi-chunk consolidation**: Given a manifest with User A at offsets [0, 120000, 240000], the repair tool produces one chunk at offset 0 — losing 120000 and 240000
2. **Late joiner consolidation**: Given User B joining at offset 300000 with chunks at [300000, 360000], the repair tool produces one chunk at offset 300000 — losing 360000
3. **Cross-user offset collapse**: Two users with interleaved chunks lose all but their first offset each

**Expected Counterexamples**:

- After repair, `manifest.chunks.length === countDistinctUsers` (always one chunk per user)
- Whisper-relative timestamps from later chunks are placed too early in absolute time

### Fix Checking

**Goal**: Verify that the repair tool no longer exists in the repository after the fix.

**Pseudocode:**

```
FOR ALL repository states after fix DO
  ASSERT NOT fileExists('tools/fix-session-recording-once.mjs')
END FOR
```

### Preservation Checking

**Goal**: Verify that the production pipeline correctly handles per-chunk timing for all valid inputs.

**Pseudocode:**

```
FOR ALL manifest WHERE manifest.version == 2 AND manifest.chunks.length > 0 DO
  FOR ALL chunk IN manifest.chunks DO
    result := transcribe(chunk)
    FOR ALL segment IN result.segments DO
      ASSERT segment.absoluteStart == segment.whisperRelativeStart + chunk.sessionOffsetMs / 1000
    END FOR
  END FOR
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:

- It generates many chunk configurations (varying offsets, durations, speaker counts)
- It catches edge cases like zero-offset chunks, maximum offsets, single-chunk sessions
- It provides strong guarantees that the offset arithmetic is correct across the input domain

**Test Plan**: Write property-based tests for the transcription offset logic and segment merge ordering, plus unit tests for the recording bot's offset calculation and stub filtering.

**Test Cases**:

1. **Offset application preservation**: Verify that `transcribe.py`'s `_iter_audio_sources` correctly converts `sessionOffsetMs` to `session_offset_s` for arbitrary chunk configurations
2. **Chronological merge preservation**: Verify that `mergeTranscriptSegments` sorts by absolute `start` time for segments from multiple speakers with varying offsets
3. **Stub filtering preservation**: Verify that chunks with files < MIN_OGG_BYTES are excluded without affecting other chunks' timing
4. **Multi-chunk manifest preservation**: Verify that a v2 manifest with N chunks per user retains all N distinct `sessionOffsetMs` values through the pipeline

### Unit Tests

- Test `mergeTranscriptSegments` sorts segments from multiple speakers by absolute start time
- Test `_iter_audio_sources` yields correct `session_offset_s` for each chunk in a v2 manifest
- Test that the recording bot computes `sessionOffsetMs` as `Date.now() - sessionStartedAt`
- Test stub filtering: files < 256 bytes are excluded from completed chunks
- Test `restoreChunkCountersFromManifest` correctly resumes chunk indexing after reconnect

### Property-Based Tests

- Generate random multi-user chunk manifests with varying `sessionOffsetMs` values and verify transcription offset arithmetic produces monotonically increasing absolute times within each chunk
- Generate random `WhisperSegment[]` arrays with multiple speakers and verify `mergeTranscriptSegments` output is sorted by `start` time
- Generate random chunk durations and offsets and verify the manifest schema validates correctly (no negative offsets, non-negative durations)

### Integration Tests

- End-to-end test: create a synthetic v2 manifest with a late-joining user, run transcription logic, verify final segment absolute times reflect the late join offset
- Test that a session with reconnects (multiple chunks per user at different offsets) produces correctly-timed transcript output
- Test that the merged transcript text has timestamps in chronological order regardless of speaker interleaving

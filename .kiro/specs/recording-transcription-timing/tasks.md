# Implementation Plan

## Overview

Delete the one-off repair tool `tools/fix-session-recording-once.mjs` and add regression tests confirming the recording/transcription pipeline's correctness for late-joining players. The production pipeline is already correct — the fix is removing dead code that could corrupt session timing if mistakenly re-run.

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Repair Tool Timing Destruction
  - **IMPORTANT**: Write this property-based test BEFORE implementing the fix
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the repair tool destroys per-chunk timing
  - **Scoped PBT Approach**: Scope the property to concrete failing cases — multi-chunk manifests where the repair tool consolidates chunks into one track per user, losing individual `sessionOffsetMs` values
  - Test that for any v2 manifest with N chunks per user (N > 1), the repair tool's consolidation logic produces only 1 chunk per user, destroying offsets for chunks 2..N
  - Given User A with chunks at offsets [0, 120000, 240000], after consolidation only offset 0 survives
  - Given User B joining late with chunks at offsets [300000, 360000], after consolidation only offset 300000 survives
  - Since the repair tool is a standalone script (not importable), write the test as a property asserting that `tools/fix-session-recording-once.mjs` exists in the repository (the bug condition) — this confirms the dead code risk is present
  - Run test on UNFIXED code — expect FAILURE (the file exists, confirming the bug condition is active)
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug condition exists)
  - Document counterexamples found: the repair tool exists and its consolidation logic (visible in code) collapses multi-chunk manifests
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 2.1_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Recording Pipeline Correctness
  - **IMPORTANT**: Follow observation-first methodology
  - **IMPORTANT**: Write these tests BEFORE implementing the fix
  - Observe behavior on UNFIXED code for non-buggy inputs (normal pipeline operation):

  - **2a. `mergeTranscriptSegments` chronological ordering**
    - Observe: `mergeTranscriptSegments([{start:5, end:6, text:"b", speaker:"B"}, {start:1, end:2, text:"a", speaker:"A"}])` produces output sorted by start time on unfixed code
    - Write property-based test: for all random arrays of `WhisperSegment` with multiple speakers and varying start/end times, the output lines are sorted by absolute `start` time
    - Generate random segments with `start >= 0`, `end >= start`, non-empty text, arbitrary speaker names
    - Assert output lines appear in non-decreasing timestamp order regardless of speaker interleaving

  - **2b. Transcription offset application (`session_offset_s`)**
    - Observe: for a v2 manifest chunk with `sessionOffsetMs = 300000`, the transcription sidecar yields `session_offset_s = 300.0` and adds it to whisper-relative timestamps
    - Write property-based test: for all non-negative integer `sessionOffsetMs` values, `_iter_audio_sources` produces `session_offset_s == sessionOffsetMs / 1000.0`
    - Generate random chunk configurations with varying `sessionOffsetMs` values (0 to 7200000)
    - Assert each yielded `AudioSource.session_offset_s` equals the chunk's `sessionOffsetMs / 1000.0`

  - **2c. Stub filtering (MIN_OGG_BYTES threshold)**
    - Observe: in `record.ts`, files with `stat.size < 256` are unlinked and NOT added to `completedChunks`
    - Write test: for files below MIN_OGG_BYTES (256), the chunk is discarded; for files >= 256 bytes, the chunk is retained
    - Verify that discarding a stub does not affect timing of subsequent valid chunks

  - **2d. `restoreChunkCountersFromManifest` resumption**
    - Observe: given chunks with paths like `audio/discord/user1/0003.ogg`, the function sets counter to 4 (next index)
    - Write property-based test: for all valid chunk arrays with `NNNN.ogg` filenames, the restored counter for each user equals `max(chunk indices for that user) + 1`
    - Generate random manifests with multiple users and varying chunk indices
    - Assert counters resume correctly after reconnect

  - Run all tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 3. Fix for repair tool removal and regression prevention
  - [ ] 3.1 Delete the one-off repair tool
    - Delete `tools/fix-session-recording-once.mjs` from the repository
    - This is the only production code change required
    - _Bug_Condition: isBugCondition(input) where repairToolExists('tools/fix-session-recording-once.mjs')_
    - _Expected_Behavior: NOT fileExists('tools/fix-session-recording-once.mjs') after fix_
    - _Preservation: No production pipeline code is modified — recording bot, transcription sidecar, manifest schema, and merge logic remain unchanged_
    - _Requirements: 1.1, 2.1_

  - [ ] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Repair Tool Removed
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior (tool should not exist)
    - When this test passes, it confirms the repair tool has been successfully removed
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — the dead code is gone)
    - _Requirements: 2.1_

  - [ ] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Recording Pipeline Correctness
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run all preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions introduced)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `pnpm test`
  - Run typecheck: `pnpm typecheck`
  - Run lint: `pnpm lint`
  - Ensure all property-based tests pass
  - Ensure no regressions in existing tests
  - Ask the user if questions arise

## Notes

- The production pipeline (`record.ts` → v2 manifest → `transcribe.py` → `mergeTranscriptSegments`) is already correct and requires no code changes
- The only code change is deleting `tools/fix-session-recording-once.mjs`
- Property-based tests for preservation use `fast-check` (TypeScript) and `hypothesis` (Python) for stronger guarantees across the input domain
- The `mergeTranscriptSegments` and `restoreChunkCountersFromManifest` tests live in `packages/shared`
- The transcription offset tests validate the Python sidecar logic in `tools/sidecars/whisper`
- The stub filtering test validates the MIN_OGG_BYTES threshold in `apps/discord-bot/src/record.ts`

## Task Dependency Graph

```json
{
  "waves": [["1", "2"], ["3"], ["4"]]
}
```

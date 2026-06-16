# Implementation Plan: Session Recording & Live Transcription

## Overview

This plan implements the transition from ordinal Ogg/Opus recording with batch transcription to timestamp-based WAV recording with live transcription. The implementation spans three codebases: the Discord bot (TypeScript), the transcription pipeline sidecar (Python), and the Tauri backend orchestrator (Rust). Components are built bottom-up — shared types and utilities first, then the recording path, then the transcription pipeline, and finally the orchestrator wiring.

## Tasks

- [x] 1. Update shared manifest schema and types
  - [x] 1.1 Update `recordingManifestChunkSchema` in `packages/shared/src/narrative/recording-manifest.schema.ts`
    - Change `codec` from `z.literal('opus_ogg')` to `z.enum(['opus_ogg', 'pcm_wav'])`
    - Change `channels` from `z.literal(2)` to `z.union([z.literal(1), z.literal(2)])`
    - Ensure `sampleRate` remains `z.literal(48_000)`
    - Export the updated inferred TypeScript type
    - _Requirements: 5.2, 5.3, 5.6_

  - [x] 1.2 Write property test for schema codec acceptance (Property 8)
    - **Property 8: Schema accepts both codec literals**
    - Verify that otherwise-valid manifest chunk objects parse successfully with both `opus_ogg` (channels: 2) and `pcm_wav` (channels: 1)
    - Use fast-check with `{ numRuns: 100 }`
    - Target file: `packages/shared/src/narrative/recording-manifest.schema.test.ts`
    - **Validates: Requirements 5.6**

  - [x] 1.3 Add pipeline state and signal schemas to `packages/shared`
    - Create `packages/shared/src/narrative/pipeline-state.schema.ts`
    - Define `pipelineStateSchema` with status enum (`starting`, `ready`, `active`, `draining`, `stopped`), `chunksTranscribed`, `chunksPending`, `lastUpdatedAt`, `errors` array
    - Define `pipelineSignalSchema` with `action: z.enum(['stop'])` and `writtenAt`
    - Export inferred types
    - _Requirements: 6.7, 8.4_

- [x] 2. Implement WAV Writer module
  - [x] 2.1 Create `apps/discord-bot/src/wav-writer.ts`
    - Implement `WavWriter` class with constructor accepting `outputPath`, `sampleRate`, `channels`, `bitsPerSample`
    - Write RIFF/WAVE header with fmt chunk and data chunk placeholder on construction
    - Implement `write(pcmBuffer: Buffer): void` to append PCM samples
    - Implement `async finalize(): Promise<{ bytesWritten: number }>` that seeks back to update data size in header and closes the file handle
    - Implement `async abort(): Promise<void>` that closes the handle and deletes the incomplete file
    - Add minimum file size check (512 bytes) — if finalized file is smaller, delete it and return 0
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.2 Write unit tests for WAV Writer
    - Test correct WAV header generation (RIFF magic, fmt chunk, PCM format tag, sample rate, bit depth, channels)
    - Test finalize updates data size correctly
    - Test abort deletes the incomplete file
    - Test minimum 512-byte threshold (file deleted if too small)
    - Test I/O error handling (write after abort)
    - Target file: `apps/discord-bot/test/wav-writer.test.ts`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3. Implement timestamp chunk naming utilities
  - [x] 3.1 Create `apps/discord-bot/src/timestamp-chunk-naming.ts`
    - Implement `timestampChunkFileName(epochSeconds: number, collisionIndex?: number): string` — returns `{epoch}.wav` for index 0/undefined, `{epoch}_{N}.wav` for N ≥ 1
    - Implement `chunkDirectoryPath(sessionDir: string, discordUserId: string): string` — returns `{sessionDir}/audio/discord/{discordUserId}/`
    - Implement collision tracking: a Map keyed by `discordUserId` → last timestamp used + counter
    - Implement `parseChunkFilename(filename: string): { timestamp: number; collisionIndex: number | null }` for reverse parsing
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.2 Write property tests for timestamp chunk naming (Properties 1, 2, 3)
    - **Property 1: Timestamp filename generation** — for any positive integer timestamp, index 0 produces `{timestamp}.wav`
    - **Property 2: Timestamp collision suffix** — for any timestamp and index N ≥ 1, produces `{timestamp}_{N}.wav`; parsing recovers both values
    - **Property 3: Chunk directory path construction** — for any session dir and user ID, path ends with `audio/discord/{discordUserId}/`
    - Use fast-check with `{ numRuns: 100 }`
    - Target file: `apps/discord-bot/test/timestamp-chunk-naming.preservation.test.ts`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

- [x] 4. Implement chunk validator
  - [x] 4.1 Create `apps/discord-bot/src/chunk-validator.ts`
    - Implement `validateChunk(filePath: string, silenceThresholdDbfs?: number): Promise<ValidationResult>`
    - Spawn `ffmpeg -i <file> -af volumedetect -f null /dev/null` and parse stderr for `mean_volume`
    - Return `{ status: 'valid', meanVolume }` if mean_volume ≥ threshold (default -50 dBFS)
    - Return `{ status: 'silent', meanVolume }` if mean_volume < threshold
    - Return `{ status: 'error', reason }` if ffmpeg fails (treat as valid per requirement 4.5)
    - Handle zero-byte files: check file size first, return silent without running ffmpeg
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.2 Write property test for silence threshold decision (Property 5)
    - **Property 5: Silence threshold decision**
    - For any dBFS value, silence decision returns `silent` iff value < -50, `valid` otherwise
    - Use fast-check with `{ numRuns: 100 }`
    - Target file: `apps/discord-bot/test/chunk-validator.preservation.test.ts`
    - **Validates: Requirements 4.2**

  - [x] 4.3 Write unit tests for chunk validator
    - Test zero-byte file detection (skip ffmpeg)
    - Test ffmpeg failure fallback (treat as valid)
    - Test parsing of valid ffmpeg volumedetect output
    - Test silent chunk detection
    - Target file: `apps/discord-bot/test/chunk-validator.test.ts`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement manifest builder
  - [x] 6.1 Create `apps/discord-bot/src/manifest-builder.ts`
    - Implement `ManifestBuilder` class that collects chunk metadata during recording
    - Method `addChunk(chunk: { discordUserId, displayName, relativePath, startTime, endTime, sessionStartTime })` — computes `sessionOffsetMs` and `durationMs`, sets codec to `pcm_wav`, sampleRate 48000, channels 1
    - Method `mergeExisting(existingManifest: RecordingManifest)` — prepends existing chunks unchanged
    - Method `build(): RecordingManifest` — returns final manifest with merged + new chunks
    - Use `relativePath` derived from timestamp filename (not ordinal index)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8_

  - [x] 6.2 Write property tests for manifest builder (Properties 6, 7, 9)
    - **Property 6: Manifest audio metadata invariant** — all new chunks have codec `pcm_wav`, sampleRate 48000, channels 1
    - **Property 7: Manifest timing computation** — sessionOffsetMs = chunkStart - sessionStart (ms); durationMs = end - start (ms)
    - **Property 9: Manifest merge preserves existing chunks** — merged output has N + M chunks, first N identical to originals
    - Use fast-check with `{ numRuns: 100 }`
    - Target file: `apps/discord-bot/test/manifest-builder.preservation.test.ts`
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.8**

- [x] 7. Refactor Discord bot recording module
  - [x] 7.1 Modify `apps/discord-bot/src/record.ts` to use new recording flow
    - Replace `spawnOggEncoder()` with `WavWriter` instantiation for each user stream
    - Replace ordinal chunk naming with `timestampChunkFileName()` and collision tracking
    - Decode incoming stereo 48kHz Opus frames → downmix to mono → write via WavWriter
    - On chunk finalization: flush WavWriter, run chunk validator, delete if silent/too-small
    - Create user directories (`audio/discord/{discordUserId}/`) before first write
    - On recording stop: build manifest with ManifestBuilder (merge existing if present), write `audio/manifest.json`
    - Handle I/O errors: abort WavWriter, delete incomplete file, log error, continue
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3, 4.4, 5.1, 5.7_

- [x] 8. Implement Python live transcription pipeline
  - [x] 8.1 Create `tools/sidecars/whisper/amber_whisper/live_pipeline.py`
    - Implement CLI entry point: `python -m amber_whisper live --session-dir <path> --language it --model small --state-file <path> --signal-file <path>`
    - On start: write state `"starting"` → load faster-whisper model → write state `"ready"`
    - Implement directory poller: scan `audio/discord/*/` for `.wav` files at ≤1s interval
    - File stability check: only process files unchanged for ≥500ms
    - Transcribe each stable chunk with faster-whisper (model "small", language "it")
    - Write `.md` output with same base name in same directory as source `.wav`
    - Update state file after each chunk (increment `chunksTranscribed`, update `chunksPending`)
    - Handle stop signal: read `pipeline-signal.json`, drain remaining queue, write state `"stopped"`, exit
    - On transcription failure: log to `transcription-errors.log`, preserve WAV, continue queue
    - Process chunks in FIFO discovery order
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 8.2 Write property tests for live pipeline utilities (Properties 4, 10, 11, 12, 13, 14)
    - **Property 4: Transcription output naming convention** — for any `.wav` path, output has same dir, same stem, `.md` extension
    - **Property 10: Pipeline state file parsing** — valid JSON with correct schema parses to matching struct
    - **Property 11: File stability check decision** — ready iff currentTime - lastModified ≥ 500ms
    - **Property 12: Pipeline state to UI state derivation** — `transcriptionActive` true iff status is `active` or `draining`
    - **Property 13: Missing state file fallback** — invalid/empty/absent content returns defaults (false, 0, 0)
    - **Property 14: Chunk processing order preservation** — discovered paths processed in FIFO order
    - Use Hypothesis with `@settings(max_examples=100)`
    - Target file: `tools/sidecars/whisper/tests/test_live_pipeline_properties.py`
    - **Validates: Requirements 3.3, 3.4, 7.5, 8.1, 8.5**

  - [x] 8.3 Write unit tests for live pipeline
    - Test file discovery logic (finds .wav, ignores .md)
    - Test stability timeout (file modified too recently is skipped)
    - Test drain behavior (processes remaining queue then exits)
    - Test error logging to `transcription-errors.log`
    - Target file: `tools/sidecars/whisper/tests/test_live_pipeline.py`
    - _Requirements: 3.7, 3.8, 6.4, 7.2, 7.5_

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Tauri backend pipeline orchestrator
  - [x] 10.1 Modify `apps/master-app/src-tauri/src/services/discord_recording.rs`
    - Add `LivePipelineRuntime` struct with `session_id`, `child: Option<Child>`, `state_file: PathBuf`, `signal_file: PathBuf`
    - On `start_recording`: spawn Python pipeline (`python -m amber_whisper live ...`), poll state file for `"ready"` with 30s timeout
    - If pipeline not ready in 30s: kill process, return error to UI
    - After pipeline ready: spawn Discord bot as before
    - On `stop_recording`: write `pipeline-signal.json` with `{ action: "stop", writtenAt }`, wait up to 120s for state `"stopped"`
    - If drain timeout: force-kill pipeline process, leave WAV files intact
    - Detect unexpected pipeline exit within 5s via process handle check, set state to stopped
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 10.2 Add pipeline state query to Tauri backend
    - Implement `pipeline_state()` query that reads `pipeline-state.json` from session directory
    - Parse state file: extract `status`, `chunksTranscribed`, `chunksPending`
    - Derive `transcriptionActive`: true if status is `"active"` or `"draining"`
    - If state file missing/unreadable: return `transcriptionActive: false`, counts as 0
    - Expose via Tauri command for UI consumption
    - _Requirements: 6.7, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 10.3 Update Rust manifest deserialization in recording ingest service
    - Update `ManifestChunk` struct: `codec` field accepts both `"opus_ogg"` and `"pcm_wav"`
    - Update `channels` field: accept both `1` and `2`
    - Ensure ingest logic handles both codecs without error
    - _Requirements: 5.6_

- [x] 11. Wire filesystem communication between bot and pipeline
  - [x] 11.1 Verify end-to-end filesystem contract
    - Ensure Discord bot writes `.wav` files to `audio/discord/{userId}/` and closes them fully before any external process reads them
    - Ensure pipeline polls correct directories relative to session dir
    - Ensure pipeline only processes files stable for ≥500ms (no partial reads)
    - Ensure pipeline leaves `.wav` files intact after transcription (stabilization phase preservation)
    - Add integration-level assertions in bot recording stop path to verify manifest references existing files
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 3.6_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The Discord bot (TypeScript) and transcription pipeline (Python) communicate only via the shared filesystem — no IPC or shared memory
- The Tauri backend (Rust) orchestrates lifecycle but does not process audio directly
- fast-check is used for TypeScript property tests; Hypothesis for Python property tests (both already in dev deps)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3"] },
    { "id": 1, "tasks": ["1.2", "2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "6.1"] },
    { "id": 4, "tasks": ["6.2", "7.1"] },
    { "id": 5, "tasks": ["8.1", "10.3"] },
    { "id": 6, "tasks": ["8.2", "8.3", "10.1"] },
    { "id": 7, "tasks": ["10.2", "11.1"] }
  ]
}
```

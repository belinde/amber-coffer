# Requirements Document

## Introduction

This feature revamps the session recording and live transcription flow in Amber Coffer. Currently the Discord bot captures per-user audio chunks using ordinal filenames (0000.ogg, 0001.ogg) and stores them compressed as Ogg/Opus, with transcription running as a post-session batch process via a Python whisper sidecar.

The new approach introduces:

1. Timestamp-based chunk naming using Unix epoch seconds for natural temporal ordering across users
2. WAV format (uncompressed) instead of Ogg/Opus compression
3. Live transcription during recording — chunks are transcribed as they complete rather than in a post-session batch

The design follows the proven pattern from the CTO reference project (`CTO/tools/`) where a `TranscriptionPipeline` consumes completed chunks via a queue in a dedicated thread, uses faster-whisper, and produces `.md` transcription output files incrementally.

## Glossary

- **Discord_Bot**: The Node.js process (`apps/discord-bot`) that joins a Discord voice channel and captures per-user audio streams
- **Chunk**: A time-bounded audio segment produced by the recording process for a single user speaking turn
- **Chunk_Filename**: The filename assigned to a chunk, using Unix timestamp in seconds as the base name
- **Transcription_Pipeline**: A component that consumes completed audio chunks from a queue and produces transcription output using faster-whisper, running concurrently with recording
- **Session_Dir**: The filesystem directory where all session artifacts (audio, transcripts, manifest) are stored
- **Manifest**: The JSON file (`audio/manifest.json`) describing all recorded chunks with metadata
- **Tauri_Backend**: The Rust backend of the master-app that orchestrates the Discord bot and transcription processes
- **Whisper_Sidecar**: The Python process running faster-whisper for speech-to-text transcription
- **Silence_Threshold**: The volume level (in dBFS) below which a chunk is considered silent and discarded
- **WAV_Format**: Uncompressed PCM audio in RIFF WAV container (16-bit, mono, 48kHz)

## Requirements

### Requirement 1: Timestamp-Based Chunk Naming

**User Story:** As a game master, I want audio chunks named with Unix timestamps so that I can naturally sort and temporally align recordings across multiple participants without relying on ordinal counters.

#### Acceptance Criteria

1. WHEN the Discord_Bot starts recording a new chunk for a user, THE Discord_Bot SHALL name the chunk file using the UTC Unix timestamp in seconds (integer epoch time) of the chunk start as the filename base (e.g., `1719849600.wav`)
2. THE Chunk_Filename SHALL follow the pattern `{unix_timestamp_seconds}.wav` where unix_timestamp_seconds is the integer UTC epoch time when the chunk recording began; the first chunk at a given timestamp SHALL NOT carry any suffix
3. WHEN two chunks for the same user would have the same Unix timestamp, THE Discord_Bot SHALL append an underscore followed by a sequential integer starting at 1 to the filename (e.g., `1719849600_1.wav`, `1719849600_2.wav`)
4. THE Discord_Bot SHALL store chunk files under `audio/discord/{discordUserId}/` within the Session_Dir, creating any missing directories in the path before writing the first chunk for that user

### Requirement 2: WAV Format Recording

**User Story:** As a game master, I want audio captured in uncompressed WAV format so that transcription can start immediately on completed chunks without a decoding step and audio quality is preserved.

#### Acceptance Criteria

1. THE Discord_Bot SHALL decode incoming stereo 48kHz Opus frames, downmix to mono, and encode the result as WAV_Format (PCM 16-bit signed, mono, 48kHz sample rate)
2. THE Discord_Bot SHALL write each chunk directly as a `.wav` file without intermediate compression
3. WHEN a chunk is finalized, THE Discord_Bot SHALL flush all buffered audio data to the WAV file and close the file handle before signaling the chunk as complete to the Transcription_Pipeline; IF finalization fails or the chunk was never finalized, THE Discord_Bot SHALL still close the file handle and allow completion signaling to proceed
4. IF a chunk file has fewer than 512 bytes after finalization, THEN THE Discord_Bot SHALL delete the file from disk and not include the chunk in the Manifest
5. IF a write error occurs during chunk recording (disk full, I/O failure), THEN THE Discord_Bot SHALL close the current chunk, delete the incomplete file, log the error, and continue recording subsequent chunks

### Requirement 3: Live Transcription During Recording

**User Story:** As a game master, I want transcription to happen live during the recording session so that partial transcripts are available immediately rather than waiting for a post-session batch process.

#### Acceptance Criteria

1. WHEN recording starts, THE Tauri_Backend SHALL spawn a Transcription_Pipeline process before the Discord_Bot begins capturing audio
2. WHEN the Discord_Bot finalizes a chunk that passes validation (non-silent, non-empty per Requirement 4), THE Discord_Bot SHALL notify the Transcription_Pipeline that a new chunk is available for processing
3. THE Transcription_Pipeline SHALL process chunks in the order they are received, transcribing each chunk using faster-whisper with model "small" and language "it" (Italian)
4. WHEN a chunk is successfully transcribed, THE Transcription_Pipeline SHALL write the transcription text to a `.md` file with the same base name as the source audio chunk, in the same directory as the source `.wav` file; IF the `.md` file creation fails (disk full, permission error), THEN THE Transcription_Pipeline SHALL treat the chunk as a transcription failure
5. THE Transcription_Pipeline SHALL target transcription of each chunk within 60 seconds; IF transcription succeeds but exceeds this target, THE Transcription_Pipeline SHALL accept and use the result normally
6. WHEN a chunk is successfully transcribed, THE Transcription_Pipeline SHALL preserve the source `.wav` file for manual verification during the stabilization phase
7. IF transcription of a chunk fails, THEN THE Transcription_Pipeline SHALL preserve the `.wav` file and log the error to a `transcription-errors.log` file in the Session_Dir
8. IF transcription of a chunk fails, THEN THE Transcription_Pipeline SHALL continue processing remaining queued chunks

### Requirement 4: Chunk Validation

**User Story:** As a game master, I want silent or empty audio chunks to be discarded automatically so that transcription does not waste time on non-speech segments.

#### Acceptance Criteria

1. WHEN a chunk is finalized, THE Discord_Bot SHALL check the chunk for silence using ffmpeg volumedetect before queuing for transcription
2. IF a chunk mean volume is below -50 dBFS (Silence_Threshold), THEN THE Discord_Bot SHALL delete the chunk file from disk, exclude it from the Manifest, and not queue it for transcription
3. IF a chunk file has zero bytes, THEN THE Discord_Bot SHALL delete the chunk file from disk, exclude it from the Manifest, and not queue it for transcription, without running volume detection
4. WHEN a chunk is discarded, THE Discord_Bot SHALL log the reason for discard (silence or zero-byte)
5. IF the ffmpeg volumedetect analysis fails for a chunk, THEN THE Discord_Bot SHALL treat the chunk as valid and queue it for transcription

### Requirement 5: Manifest Update for New Format

**User Story:** As a game master, I want the recording manifest to reflect the new WAV format and timestamp naming so that post-session tooling correctly interprets the recorded data.

#### Acceptance Criteria

1. WHEN recording stops, THE Discord_Bot SHALL write a manifest file at `audio/manifest.json` in the Session_Dir
2. THE Manifest SHALL include the codec field set to `pcm_wav` for each newly recorded chunk
3. THE Manifest SHALL include the sample rate as 48000 and channels as 1 for each newly recorded chunk
4. THE Manifest SHALL include `sessionOffsetMs` for each chunk, calculated as the wall-clock difference in milliseconds between the chunk recording start time and the session start time
5. THE Manifest SHALL include `durationMs` for each chunk, calculated as the wall-clock elapsed time in milliseconds from when the chunk recording started to when it was finalized
6. THE Tauri_Backend SHALL update the shared manifest schema to accept both `pcm_wav` and `opus_ogg` as valid codec literals, and the Rust ingest logic SHALL parse and store chunks of either codec without error
7. THE Discord_Bot SHALL set the `relativePath` for each newly recorded chunk using a timestamp-based filename derived from the chunk start time, rather than an ordinal index
8. WHEN a prior manifest exists in the Session_Dir at recording start, THE Discord_Bot SHALL merge previously recorded chunks (which may use `opus_ogg` codec, stereo channels, or ordinal filenames) unchanged into the final manifest alongside new `pcm_wav` chunks

### Requirement 6: Transcription Pipeline Lifecycle

**User Story:** As a game master, I want the transcription pipeline to start and stop cleanly with the recording session so that resources are properly managed and no chunks are lost.

#### Acceptance Criteria

1. WHEN the Tauri_Backend starts a recording session, THE Tauri_Backend SHALL spawn the Transcription_Pipeline process and wait for it to report a ready state via its state file before instructing the Discord_Bot to begin capturing audio
2. IF the Transcription_Pipeline does not report a ready state within 30 seconds of being spawned, THEN THE Tauri_Backend SHALL abort the recording session start, terminate the pipeline process, and report an error to the UI
3. WHEN the Tauri_Backend stops a recording session, THE Tauri_Backend SHALL signal the Transcription_Pipeline to finish processing all queued chunks and transition the pipeline state to draining
4. WHEN the Transcription_Pipeline receives a stop signal, THE Transcription_Pipeline SHALL complete transcription of all chunks currently in the queue before exiting and transitioning the pipeline state to stopped
5. IF the Transcription_Pipeline does not complete within 120 seconds after stop signal, THEN THE Tauri_Backend SHALL force-terminate the pipeline process and preserve unprocessed `.wav` files in their original location within the Session_Dir for later manual or batch transcription; force termination may result in loss of the chunk being actively processed at termination time
6. WHEN the Transcription_Pipeline is terminated during draining (whether by timeout or clean shutdown), THE Tauri_Backend SHALL preserve all remaining `.wav` files in the Session_Dir regardless of the termination reason
7. IF the Transcription_Pipeline process exits unexpectedly while recording is active, THEN THE Tauri_Backend SHALL detect the exit within 5 seconds, transition the pipeline state to stopped, and continue recording so that `.wav` files are preserved for later transcription
8. THE Tauri_Backend SHALL track the transcription pipeline state (active, draining, stopped) by reading the pipeline state file and expose it to the UI via the session pipeline state query

### Requirement 7: Communication Between Discord Bot and Transcription Pipeline

**User Story:** As a developer, I want a reliable mechanism for the Discord bot to notify the transcription pipeline about completed chunks so that transcription can begin immediately.

#### Acceptance Criteria

1. THE Discord_Bot SHALL communicate completed chunks to the Transcription_Pipeline via filesystem presence: the Transcription_Pipeline polls the session audio directories (`audio/discord/{discordUserId}/`) for new `.wav` files
2. THE Transcription_Pipeline SHALL poll the audio directories at an interval no greater than 1 second; chunk detection timing is independent of chunk completion timing and allows natural polling delays
3. IF the Transcription_Pipeline is not running when a chunk completes, THEN THE Discord_Bot SHALL leave the chunk `.wav` file and its directory structure intact on disk so that the pipeline can discover and transcribe it upon recovery
4. THE communication mechanism SHALL require no shared memory or IPC socket, supporting the Transcription_Pipeline as a separate Python process from the Node.js Discord_Bot by relying solely on the shared filesystem within Session_Dir
5. THE Transcription_Pipeline SHALL only consider a `.wav` file ready for processing after it has not been modified for at least 500 milliseconds, preventing reads of partially-written files

### Requirement 8: UI Pipeline State for Live Transcription

**User Story:** As a game master, I want to see live transcription progress in the UI so that I know the system is working during the recording session.

#### Acceptance Criteria

1. WHILE recording is active, THE Tauri_Backend SHALL expose a `transcriptionActive` boolean in the session pipeline state, set to `true` when the Transcription_Pipeline is processing audio chunks and `false` otherwise
2. WHILE recording is active, THE Tauri_Backend SHALL expose a `chunksTranscribed` non-negative integer count in the session pipeline state representing chunks successfully transcribed
3. WHILE recording is active, THE Tauri_Backend SHALL expose a `chunksPending` non-negative integer count in the session pipeline state representing chunks queued but not yet transcribed
4. WHEN the session pipeline state is polled, THE Tauri_Backend SHALL read transcription progress from the filesystem state file written by the Transcription_Pipeline
5. IF the filesystem state file written by the Transcription_Pipeline is missing or unreadable when polled, THEN THE Tauri_Backend SHALL reset all progress counters and return `transcriptionActive` as `false` and both `chunksTranscribed` and `chunksPending` as `0`

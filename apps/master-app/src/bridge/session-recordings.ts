import { sessionRecordingViewSchema, type Session, type SessionRecordingView } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';

export type { SessionRecordingView };

function parseSessionRecording(raw: unknown): SessionRecordingView {
  return sessionRecordingViewSchema.parse(raw);
}

export async function listSessionRecordings(
  sessionId: Session['id'],
): Promise<SessionRecordingView[]> {
  const raw = await invoke<unknown[]>('list_session_recordings', { sessionId });
  return raw.map(parseSessionRecording);
}

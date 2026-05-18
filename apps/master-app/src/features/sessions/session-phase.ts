import type { Session } from '@amber/shared';

export type SessionUiPhase = 'preparing' | 'live' | 'post';

const POST_PIPELINE_STATUSES: ReadonlySet<Session['status']> = new Set([
  'recorded',
  'transcribing',
  'transcribed',
  'refining',
  'refined',
  'validating',
  'published',
]);

/**
 * UI phase for the session detail orchestrator (distinct from pipeline `status`).
 */
export function resolveSessionUiPhase(session: Session): SessionUiPhase {
  if (session.playState === 'live') {
    return 'live';
  }
  if (session.playState === 'ended') {
    return 'post';
  }
  if (POST_PIPELINE_STATUSES.has(session.status)) {
    return 'post';
  }
  return 'preparing';
}

export function isSessionPlayLocked(session: Session): boolean {
  return session.playState === 'live';
}

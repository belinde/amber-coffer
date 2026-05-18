import { describe, expect, it } from 'vitest';

import { formatInvokeErrorMessage } from './parse-invoke-error.js';

describe('formatInvokeErrorMessage', () => {
  it('extracts message from Tauri serialized AppError payload', () => {
    const msg = formatInvokeErrorMessage({
      kind: 'message',
      message: 'internal error: Whisper venv missing',
    });
    expect(msg).toBe('internal error: Whisper venv missing');
  });

  it('uses Error.message for Error instances', () => {
    expect(formatInvokeErrorMessage(new Error('boom'))).toBe('boom');
  });
});

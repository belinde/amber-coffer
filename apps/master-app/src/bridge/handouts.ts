import { handoutSchema, type Handout, type ImageRef, type Session } from '@amber/shared';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

const shareImageAsHandoutInputSchema = z.object({
  sessionId: z.string().min(1),
  label: z.string().min(1),
  sessionToken: z.string().min(1),
  syncApiBaseUrl: z.string().min(1),
  campaignId: z.string().min(1),
  localPath: z.string().min(1).optional(),
  absoluteSourcePath: z.string().min(1).optional(),
  campaignImageId: z.string().min(1).optional(),
});

export type ShareImageAsHandoutInput = z.infer<typeof shareImageAsHandoutInputSchema>;

function parseHandout(raw: unknown): Handout {
  return handoutSchema.parse(raw);
}

export async function shareImageAsHandout(input: ShareImageAsHandoutInput): Promise<Handout> {
  const payload = shareImageAsHandoutInputSchema.parse(input);
  const raw = await invoke<unknown>('share_image_as_handout', { input: payload });
  return parseHandout(raw);
}

export async function listHandouts(sessionId: Session['id']): Promise<Handout[]> {
  const raw = await invoke<unknown[]>('list_handouts', { sessionId });
  return raw.map(parseHandout);
}

export async function shareHandout(args: {
  handoutId: Handout['id'];
  sessionToken: string;
  syncApiBaseUrl: string;
}): Promise<Handout> {
  const raw = await invoke<unknown>('share_handout', {
    handoutId: args.handoutId,
    sessionToken: args.sessionToken,
    syncApiBaseUrl: args.syncApiBaseUrl,
  });
  return parseHandout(raw);
}

export async function hideHandout(handoutId: Handout['id']): Promise<void> {
  return invoke<void>('hide_handout', { handoutId });
}

export type SessionImageSource = {
  localPath?: string;
  absoluteSourcePath?: string;
  campaignImageId?: string;
};

export function imageRefToSessionSource(
  image: ImageRef | null | undefined,
): SessionImageSource | null {
  const local = image?.local?.trim();
  if (!local) return null;
  return { localPath: local };
}

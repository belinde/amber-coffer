import { open } from '@tauri-apps/plugin-dialog';

const IMAGE_FILTER = {
  name: 'Images',
  extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
};

/** Opens a native file picker for a single image; returns absolute path or null if cancelled. */
export async function pickImageFilePath(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [IMAGE_FILTER],
  });
  if (selected === null || Array.isArray(selected)) return null;
  return selected;
}

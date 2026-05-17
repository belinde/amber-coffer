import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { generateUuidV7 } from '@amber/shared';

export type AmberMappingFile = {
  version: 1;
  campaignId: string;
  files: Record<string, string>;
};

const MAPPING_FILENAME = '.amber-mapping.json';

export function mappingPath(rootPath: string): string {
  return join(rootPath, MAPPING_FILENAME);
}

export async function loadMapping(
  rootPath: string,
  campaignId: string,
): Promise<AmberMappingFile> {
  const path = mappingPath(rootPath);
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as AmberMappingFile;
    if (parsed.version === 1 && parsed.campaignId === campaignId) {
      return parsed;
    }
  } catch {
    // fresh mapping
  }
  return { version: 1, campaignId, files: {} };
}

export async function saveMapping(rootPath: string, mapping: AmberMappingFile): Promise<void> {
  await writeFile(mappingPath(rootPath), JSON.stringify(mapping, null, 2), 'utf8');
}

export function resolveFileId(
  mapping: AmberMappingFile,
  relativePath: string,
): string {
  const existing = mapping.files[relativePath];
  if (existing) return existing;
  const id = generateUuidV7();
  mapping.files[relativePath] = id;
  return id;
}

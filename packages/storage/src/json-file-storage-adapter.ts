import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createSnapshotBackedStorageAdapter } from './key-value-storage-adapter.ts';
import { createEmptyStorageSnapshot, type StorageSnapshot } from './snapshot.ts';
import type { StorageAdapter } from './storage-adapter.ts';

export type JsonFileStorageOptions = {
  now?: () => string;
};

export function createJsonFileStorageAdapter(filePath: string, options: JsonFileStorageOptions = {}): StorageAdapter {
  const now = options.now ?? (() => new Date().toISOString());

  async function readSnapshot(): Promise<StorageSnapshot> {
    try {
      const raw = await readFile(filePath, 'utf8');
      return { ...createEmptyStorageSnapshot(now), ...JSON.parse(raw) } as StorageSnapshot;
    } catch (error) {
      if (isNotFound(error)) {
        return createEmptyStorageSnapshot(now);
      }
      throw error;
    }
  }

  async function writeSnapshot(snapshot: StorageSnapshot): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
  }

  return createSnapshotBackedStorageAdapter(readSnapshot, writeSnapshot);
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

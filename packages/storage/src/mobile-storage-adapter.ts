import { createKeyValueStorageAdapter, type KeyValueStore } from './key-value-storage-adapter.ts';
import type { StorageAdapter } from './storage-adapter.ts';

export type MobileStorageOptions = {
  key?: string;
};

export function createMobileStorageAdapter(store: KeyValueStore, options: MobileStorageOptions = {}): StorageAdapter {
  return createKeyValueStorageAdapter(store, { key: options.key ?? 'hello-world:mobile-storage:v1' });
}

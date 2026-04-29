import { createKeyValueStorageAdapter, type KeyValueStore } from './key-value-storage-adapter.ts';
import type { StorageAdapter } from './storage-adapter.ts';

export type IndexedDBStorageOptions = {
  databaseName?: string;
  storeName?: string;
  key?: string;
};

export function createIndexedDBStorageAdapter(options: IndexedDBStorageOptions = {}): StorageAdapter {
  const databaseName = options.databaseName ?? 'hello-world';
  const storeName = options.storeName ?? 'kv';
  const keyValueStore: KeyValueStore = {
    async getItem(key) {
      const database = await openDatabase(databaseName, storeName);
      return requestToPromise(database.transaction(storeName, 'readonly').objectStore(storeName).get(key));
    },
    async setItem(key, value) {
      const database = await openDatabase(databaseName, storeName);
      await requestToPromise(database.transaction(storeName, 'readwrite').objectStore(storeName).put(value, key));
    },
    async removeItem(key) {
      const database = await openDatabase(databaseName, storeName);
      await requestToPromise(database.transaction(storeName, 'readwrite').objectStore(storeName).delete(key));
    },
  };

  return createKeyValueStorageAdapter(keyValueStore, { key: options.key });
}

function openDatabase(databaseName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

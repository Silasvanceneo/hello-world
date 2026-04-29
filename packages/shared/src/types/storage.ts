export type StorageScope = 'web' | 'desktop' | 'mobile' | 'server';

export type StorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

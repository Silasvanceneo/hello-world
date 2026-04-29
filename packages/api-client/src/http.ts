import type { ConnectionStatus, ProviderErrorReason } from '@hello-world/shared';
import type { ProviderRuntimeContext } from './provider-adapter.ts';

export function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function getFetch(context?: ProviderRuntimeContext): typeof fetch {
  const fetchImpl = context?.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('Fetch API is not available in this runtime.');
  }
  return fetchImpl;
}

export function checkedAt(context?: ProviderRuntimeContext): string {
  return context?.now?.() ?? new Date().toISOString();
}

export function reasonFromHttpStatus(status: number): ProviderErrorReason {
  if (status === 401 || status === 403) {
    return 'auth';
  }
  if (status === 404) {
    return 'model';
  }
  if (status >= 500) {
    return 'network';
  }
  return 'unknown';
}

export function toConnectionFailure(error: unknown, context?: ProviderRuntimeContext): ConnectionStatus {
  if (isProviderHttpError(error)) {
    return { ok: false, checkedAt: checkedAt(context), reason: reasonFromHttpStatus(error.status), message: error.message };
  }

  if (error instanceof TypeError) {
    return { ok: false, checkedAt: checkedAt(context), reason: 'network', message: error.message };
  }

  if (error instanceof Error) {
    return { ok: false, checkedAt: checkedAt(context), reason: 'unknown', message: error.message };
  }

  return { ok: false, checkedAt: checkedAt(context), reason: 'unknown', message: 'Unknown provider error.' };
}

export class ProviderHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ProviderHttpError';
    this.status = status;
  }
}

export function isProviderHttpError(error: unknown): error is ProviderHttpError {
  return error instanceof ProviderHttpError;
}

export async function assertOk(response: Response, providerName: string): Promise<void> {
  if (response.ok) {
    return;
  }

  let detail = response.statusText;
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    detail = body.error?.message ?? body.message ?? detail;
  } catch {
    // Keep the status text when the response body is not JSON.
  }

  throw new ProviderHttpError(response.status, `${providerName} request failed: ${detail}`);
}

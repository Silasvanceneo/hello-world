import type { ChatError } from '@hello-world/shared';

export function normalizeProviderError(error: unknown): ChatError {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'aborted', message: 'Request was aborted.', retryable: true };
  }

  if (error instanceof Error) {
    return { code: 'unknown', message: error.message, retryable: false };
  }

  return { code: 'unknown', message: 'Unknown provider error.', retryable: false };
}

export function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return '????';
  }

  return `${secret.slice(0, 3)}????${secret.slice(-4)}`;
}

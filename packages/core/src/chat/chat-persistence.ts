import type { ChatSession, StorageResult } from '@hello-world/shared';
import type { StorageAdapter } from '@hello-world/storage';

export function loadChatSessions(storage: StorageAdapter): Promise<StorageResult<ChatSession[]>> {
  return storage.listSessions();
}

export function saveChatSession(storage: StorageAdapter, session: ChatSession): Promise<StorageResult<ChatSession>> {
  return storage.saveSession(session);
}

export function deleteChatSession(storage: StorageAdapter, sessionId: string): Promise<StorageResult<void>> {
  return storage.deleteSession(sessionId);
}

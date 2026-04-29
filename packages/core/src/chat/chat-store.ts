import type { ChatMessage, ChatSession } from '@hello-world/shared';

export type ChatStore = {
  sessions: ChatSession[];
  activeSessionId?: string;
};

export function createEmptyChatStore(): ChatStore {
  return { sessions: [] };
}

export function upsertSession(store: ChatStore, session: ChatSession): ChatStore {
  const exists = store.sessions.some((item) => item.id === session.id);
  const sessions = exists
    ? store.sessions.map((item) => (item.id === session.id ? session : item))
    : [session, ...store.sessions];

  return { ...store, sessions, activeSessionId: store.activeSessionId ?? session.id };
}

export function appendMessage(store: ChatStore, sessionId: string, message: ChatMessage): ChatStore {
  const sessions = store.sessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }

    return {
      ...session,
      messages: [...session.messages, message],
      updatedAt: message.updatedAt,
      syncState: 'dirty' as const,
    };
  });

  return { ...store, sessions };
}

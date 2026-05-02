import type { ChatRequest } from './provider-adapter.ts';

export function splitSystemAndMessages(messages: ChatRequest['messages']): {
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
} {
  const systemMessages = messages.filter((message) => message.role === 'system').map((message) => message.content).filter(Boolean);
  return {
    system: systemMessages.length > 0 ? systemMessages.join('\n\n') : undefined,
    messages: messages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({ role: message.role, content: message.content })),
  };
}

import type { ChatChunk } from '@hello-world/shared';

export async function* parseOpenAIStream(stream: ReadableStream<Uint8Array> | null): AsyncIterable<ChatChunk> {
  if (!stream) {
    yield { type: 'error', error: { code: 'network', message: 'Provider returned an empty stream.', retryable: true } };
    yield { type: 'done' };
    return;
  }

  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer = value ? `${buffer}${decoder.decode(value, { stream: !done })}` : buffer;
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';

      for (const event of events) {
        yield* parseOpenAIEvent(event);
      }

      if (done) {
        if (buffer.trim()) {
          yield* parseOpenAIEvent(buffer);
        }
        yield { type: 'done' };
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function* parseOpenAIEvent(event: string): Iterable<ChatChunk> {
  const dataLines = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim());

  for (const data of dataLines) {
    if (!data) {
      continue;
    }

    if (data === '[DONE]') {
      yield { type: 'done' };
      continue;
    }

    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const delta = parsed.choices?.[0]?.delta;
      if (delta?.reasoning_content) {
        yield { type: 'reasoning-delta', text: delta.reasoning_content };
      }
      if (delta?.content) {
        yield { type: 'text-delta', text: delta.content };
      }
      if (parsed.usage) {
        yield {
          type: 'usage',
          usage: {
            promptTokens: parsed.usage.prompt_tokens ?? 0,
            completionTokens: parsed.usage.completion_tokens ?? 0,
            totalTokens: parsed.usage.total_tokens ?? 0,
          },
        };
      }
    } catch (error) {
      yield {
        type: 'error',
        error: {
          code: 'unknown',
          message: error instanceof Error ? error.message : 'Invalid OpenAI stream event.',
          retryable: false,
        },
      };
    }
  }
}

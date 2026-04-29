import type { ChatChunk } from '@hello-world/shared';

export async function* parseOllamaStream(stream: ReadableStream<Uint8Array> | null): AsyncIterable<ChatChunk> {
  if (!stream) {
    yield { type: 'error', error: { code: 'network', message: 'Ollama returned an empty stream.', retryable: true } };
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
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        yield* parseOllamaLine(line);
      }

      if (done) {
        if (buffer.trim()) {
          yield* parseOllamaLine(buffer);
        }
        yield { type: 'done' };
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function* parseOllamaLine(line: string): Iterable<ChatChunk> {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      message?: { content?: string };
      done?: boolean;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    if (parsed.message?.content) {
      yield { type: 'text-delta', text: parsed.message.content };
    }

    if (parsed.done) {
      const promptTokens = parsed.prompt_eval_count ?? 0;
      const completionTokens = parsed.eval_count ?? 0;
      if (promptTokens > 0 || completionTokens > 0) {
        yield { type: 'usage', usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } };
      }
      yield { type: 'done' };
    }
  } catch (error) {
    yield {
      type: 'error',
      error: {
        code: 'unknown',
        message: error instanceof Error ? error.message : 'Invalid Ollama stream line.',
        retryable: false,
      },
    };
  }
}

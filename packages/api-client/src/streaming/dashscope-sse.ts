import type { ChatChunk } from '@hello-world/shared';
import { parseSseEvents } from './sse.ts';

export async function* parseDashScopeStream(stream: ReadableStream<Uint8Array> | null): AsyncIterable<ChatChunk> {
  if (!stream) {
    yield { type: 'error', error: { code: 'network', message: 'Provider returned an empty stream.', retryable: true } };
    yield { type: 'done' };
    return;
  }

  for await (const event of parseSseEvents(stream)) {
    if (event.data === '[DONE]') {
      yield { type: 'done' };
      continue;
    }

    try {
      const parsed = JSON.parse(event.data) as {
        output?: { text?: string; choices?: Array<{ message?: { content?: string } }> };
        usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
      };
      const text = parsed.output?.text ?? parsed.output?.choices?.[0]?.message?.content;
      if (text) {
        yield { type: 'text-delta', text };
      }
      if (parsed.usage) {
        yield {
          type: 'usage',
          usage: {
            promptTokens: parsed.usage.input_tokens ?? 0,
            completionTokens: parsed.usage.output_tokens ?? 0,
            totalTokens: parsed.usage.total_tokens ?? (parsed.usage.input_tokens ?? 0) + (parsed.usage.output_tokens ?? 0),
          },
        };
      }
    } catch (error) {
      yield {
        type: 'error',
        error: {
          code: 'unknown',
          message: error instanceof Error ? error.message : 'Invalid DashScope stream event.',
          retryable: false,
        },
      };
    }
  }

  yield { type: 'done' };
}

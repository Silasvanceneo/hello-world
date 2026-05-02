import type { ChatChunk } from '@hello-world/shared';
import { parseSseEvents } from './sse.ts';

export async function* parseAnthropicStream(stream: ReadableStream<Uint8Array> | null): AsyncIterable<ChatChunk> {
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
        type?: string;
        delta?: { type?: string; text?: string };
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const type = parsed.type ?? event.event;
      if (type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta.text) {
        yield { type: 'text-delta', text: parsed.delta.text };
      }
      if (parsed.usage) {
        const promptTokens = parsed.usage.input_tokens ?? 0;
        const completionTokens = parsed.usage.output_tokens ?? 0;
        yield { type: 'usage', usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } };
      }
    } catch (error) {
      yield {
        type: 'error',
        error: {
          code: 'unknown',
          message: error instanceof Error ? error.message : 'Invalid Anthropic stream event.',
          retryable: false,
        },
      };
    }
  }

  yield { type: 'done' };
}

import type { ChatChunk } from '@hello-world/shared';
import { parseSseEvents } from './sse.ts';

export async function* parseGeminiStream(stream: ReadableStream<Uint8Array> | null): AsyncIterable<ChatChunk> {
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
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
      };
      for (const candidate of parsed.candidates ?? []) {
        for (const part of candidate.content?.parts ?? []) {
          if (part.text) {
            yield { type: 'text-delta', text: part.text };
          }
        }
      }
      if (parsed.usageMetadata) {
        const usage = parsed.usageMetadata;
        yield {
          type: 'usage',
          usage: {
            promptTokens: usage.promptTokenCount ?? 0,
            completionTokens: usage.candidatesTokenCount ?? 0,
            totalTokens: usage.totalTokenCount ?? (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0),
          },
        };
      }
    } catch (error) {
      yield {
        type: 'error',
        error: {
          code: 'unknown',
          message: error instanceof Error ? error.message : 'Invalid Gemini stream event.',
          retryable: false,
        },
      };
    }
  }

  yield { type: 'done' };
}

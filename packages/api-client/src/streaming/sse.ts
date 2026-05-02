type SseEvent = {
  event?: string;
  data: string;
};

export async function* parseSseEvents(stream: ReadableStream<Uint8Array> | null): AsyncIterable<SseEvent> {
  if (!stream) {
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
        const parsed = parseSseEvent(event);
        if (parsed) {
          yield parsed;
        }
      }

      if (done) {
        if (buffer.trim()) {
          const parsed = parseSseEvent(buffer);
          if (parsed) {
            yield parsed;
          }
        }
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseEvent(raw: string): SseEvent | undefined {
  const eventLines = raw.split(/\r?\n/);
  const event = eventLines.find((line) => line.startsWith('event:'))?.slice('event:'.length).trim();
  const data = eventLines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .join('\n')
    .trim();

  return data ? { event, data } : undefined;
}

export function defaultBaseUrl(type) {
  if (type === 'ollama') {
    return 'http://127.0.0.1:11434';
  }
  return 'https://api.openai.com/v1';
}

export function defaultModel(type) {
  if (type === 'ollama') {
    return 'llama3.2';
  }
  return 'gpt-4.1-mini';
}

export function providerEndpoint(provider, path) {
  const baseUrl = (provider.baseUrl || defaultBaseUrl(provider.type)).replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export async function validateProviderInBrowser(provider, runtime = {}) {
  const fetchImpl = runtime.fetch ?? fetch;
  const response = await fetchImpl(provider.type === 'ollama'
    ? providerEndpoint(provider, '/api/tags')
    : providerEndpoint(provider, '/models'), {
    method: 'GET',
    headers: provider.type === 'ollama' ? {} : authHeaders(runtime.apiKey),
  });
  if (!response.ok) {
    throw new Error(`Provider validation failed: ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  return provider.type === 'ollama'
    ? (body.models ?? []).map((model) => model.name)
    : (body.data ?? []).map((model) => model.id);
}

export async function streamChatInBrowser({ provider, modelId, messages, apiKey, signal, onDelta, fetch: fetchOverride }) {
  const fetchImpl = fetchOverride ?? fetch;
  const isOllama = provider.type === 'ollama';
  const response = await fetchImpl(isOllama ? providerEndpoint(provider, '/api/chat') : providerEndpoint(provider, '/chat/completions'), {
    method: 'POST',
    headers: isOllama ? { 'content-type': 'application/json' } : { 'content-type': 'application/json', ...authHeaders(apiKey) },
    signal,
    body: JSON.stringify({ model: modelId || defaultModel(provider.type), messages, stream: true }),
  });
  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
  }

  let fullText = '';
  for await (const chunk of isOllama ? parseOllamaBrowserStream(response.body) : parseOpenAIBrowserStream(response.body)) {
    if (chunk.type === 'text-delta') {
      fullText += chunk.text;
      onDelta?.(chunk.text, fullText);
    }
  }
  return fullText;
}

export async function* parseOpenAIBrowserStream(stream) {
  if (!stream) {
    return;
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
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
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* parseOllamaBrowserStream(stream) {
  if (!stream) {
    return;
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer = value ? `${buffer}${decoder.decode(value, { stream: !done })}` : buffer;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const chunk = parseOllamaLine(line);
        if (chunk) {
          yield chunk;
        }
      }
      if (done) {
        const chunk = parseOllamaLine(buffer);
        if (chunk) {
          yield chunk;
        }
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function* parseOpenAIEvent(event) {
  const lines = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim());
  for (const line of lines) {
    if (!line || line === '[DONE]') {
      continue;
    }
    const parsed = JSON.parse(line);
    const text = parsed.choices?.[0]?.delta?.content;
    if (text) {
      yield { type: 'text-delta', text };
    }
  }
}

function parseOllamaLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = JSON.parse(trimmed);
  const text = parsed.message?.content;
  return text ? { type: 'text-delta', text } : undefined;
}

function authHeaders(apiKey) {
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

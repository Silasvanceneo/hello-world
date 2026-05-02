export function defaultBaseUrl(type) {
  if (type === 'ollama') {
    return 'http://127.0.0.1:11434';
  }
  if (type === 'anthropic') {
    return 'https://api.anthropic.com/v1';
  }
  if (type === 'gemini') {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }
  if (type === 'azure-openai') {
    return '';
  }
  if (type === 'dashscope') {
    return 'https://dashscope.aliyuncs.com/api/v1';
  }
  return 'https://api.openai.com/v1';
}

export function defaultModel(type) {
  if (type === 'ollama') {
    return 'llama3.2';
  }
  if (type === 'anthropic') {
    return 'claude-sonnet-4-5';
  }
  if (type === 'gemini') {
    return 'gemini-2.5-flash';
  }
  if (type === 'dashscope') {
    return 'qwen-plus';
  }
  return 'gpt-4.1-mini';
}

export function defaultImageModel(type) {
  if (type === 'openai') {
    return 'gpt-image-1.5';
  }
  if (type === 'openai-compatible' || type === 'azure-openai') {
    return 'gpt-image-1';
  }
  return undefined;
}

export function nativeProviderKind(type) {
  if (type === 'openai') return 'openai-responses';
  if (type === 'anthropic') return 'anthropic-messages';
  if (type === 'gemini') return 'gemini-native';
  if (type === 'azure-openai') return 'azure-openai';
  if (type === 'dashscope') return 'dashscope-native';
  if (type === 'ollama') return 'ollama';
  return 'openai-compatible';
}

export function providerEndpoint(provider, path) {
  const baseUrl = (provider.baseUrl || defaultBaseUrl(provider.type)).replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

export async function validateProviderInBrowser(provider, runtime = {}) {
  const fetchImpl = runtime.fetch ?? fetch;
  const kind = nativeProviderKind(provider.type);
  const response = await fetchImpl(validationEndpoint(provider, kind), {
    method: 'GET',
    headers: validationHeaders(kind, runtime.apiKey),
  });
  if (!response.ok) {
    throw new Error(`Provider validation failed: ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  return modelIdsFromValidationBody(kind, body);
}

export async function streamChatInBrowser({ provider, modelId, messages, apiKey, signal, onDelta, onUsage, fetch: fetchOverride }) {
  const fetchImpl = fetchOverride ?? fetch;
  const kind = nativeProviderKind(provider.type);
  const response = await fetchImpl(chatEndpoint(provider, kind, modelId || defaultModel(provider.type)), {
    method: 'POST',
    headers: chatHeaders(kind, apiKey),
    signal,
    body: JSON.stringify(chatBody(kind, modelId || defaultModel(provider.type), messages)),
  });
  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
  }

  let fullText = '';
  let usage;
  for await (const chunk of parseProviderBrowserStream(kind, response.body)) {
    if (chunk.type === 'text-delta') {
      fullText += chunk.text;
      onDelta?.(chunk.text, fullText);
    }
    if (chunk.type === 'usage') {
      usage = mergeUsage(usage, chunk.usage);
      onUsage?.(usage);
    }
  }
  return fullText;
}

export async function generateImageInBrowser({
  provider,
  modelId,
  prompt,
  apiKey,
  size = '1024x1024',
  signal,
  fetch: fetchOverride,
}) {
  const fetchImpl = fetchOverride ?? fetch;
  const kind = nativeProviderKind(provider.type);
  if (!supportsImageGeneration(kind)) {
    throw new Error(`Image generation is not supported by ${provider.type}. Use OpenAI, Azure OpenAI, or an OpenAI-compatible image endpoint.`);
  }
  const response = await fetchImpl(imageGenerationEndpoint(provider, kind, modelId || defaultImageModel(provider.type)), {
    method: 'POST',
    headers: chatHeaders(kind, apiKey),
    signal,
    body: JSON.stringify(imageGenerationBody(kind, modelId || defaultImageModel(provider.type), prompt, size)),
  });
  if (!response.ok) {
    throw new Error(`Image request failed: ${response.status} ${response.statusText}`);
  }
  const body = await response.json();
  return parseImageGenerationBody(body);
}

export async function* parseAnthropicBrowserStream(stream) {
  for await (const event of parseBrowserSse(stream)) {
    if (event.data === '[DONE]') continue;
    const parsed = JSON.parse(event.data);
    const usage = anthropicUsageFromEvent(parsed);
    if (usage) yield { type: 'usage', usage };
    if ((parsed.type ?? event.event) === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta.text) {
      yield { type: 'text-delta', text: parsed.delta.text };
    }
  }
}

export async function* parseGeminiBrowserStream(stream) {
  for await (const event of parseBrowserSse(stream)) {
    if (event.data === '[DONE]') continue;
    const parsed = JSON.parse(event.data);
    const usage = geminiUsageFromEvent(parsed);
    if (usage) yield { type: 'usage', usage };
    for (const candidate of parsed.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.text) yield { type: 'text-delta', text: part.text };
      }
    }
  }
}

export async function* parseDashScopeBrowserStream(stream) {
  for await (const event of parseBrowserSse(stream)) {
    if (event.data === '[DONE]') continue;
    const parsed = JSON.parse(event.data);
    const usage = dashScopeUsageFromEvent(parsed);
    if (usage) yield { type: 'usage', usage };
    const text = parsed.output?.text ?? parsed.output?.choices?.[0]?.message?.content;
    if (text) yield { type: 'text-delta', text };
  }
}

export async function* parseOpenAIResponsesBrowserStream(stream) {
  for await (const event of parseBrowserSse(stream)) {
    if (event.data === '[DONE]') continue;
    const parsed = JSON.parse(event.data);
    const usage = openAIResponsesUsageFromEvent(parsed);
    if (usage) yield { type: 'usage', usage };
    if ((parsed.type ?? event.event) === 'response.output_text.delta' && parsed.delta) {
      yield { type: 'text-delta', text: parsed.delta };
    }
  }
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
    const usage = openAIChatUsageFromEvent(parsed);
    if (usage) {
      yield { type: 'usage', usage };
    }
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
  if (text) return { type: 'text-delta', text };
  const promptTokens = numericUsageValue(parsed.prompt_eval_count);
  const completionTokens = numericUsageValue(parsed.eval_count);
  if (promptTokens || completionTokens) {
    return { type: 'usage', usage: usageFromParts(promptTokens, completionTokens, parsed.total_count) };
  }
  return undefined;
}

function authHeaders(apiKey) {
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

function validationEndpoint(provider, kind) {
  if (kind === 'ollama') return providerEndpoint(provider, '/api/tags');
  if (kind === 'azure-openai') return azureEndpoint(provider, '/openai/deployments');
  if (kind === 'dashscope-native') return providerEndpoint(provider, '/services/aigc/text-generation/models');
  return providerEndpoint(provider, '/models');
}

function validationHeaders(kind, apiKey) {
  if (kind === 'ollama') return {};
  if (kind === 'anthropic-messages') return { 'anthropic-version': '2023-06-01', ...(apiKey ? { 'x-api-key': apiKey } : {}) };
  if (kind === 'gemini-native') return apiKey ? { 'x-goog-api-key': apiKey } : {};
  if (kind === 'azure-openai') return apiKey ? { 'api-key': apiKey } : {};
  if (kind === 'dashscope-native') return { 'x-dashscope-sse': 'enable', ...authHeaders(apiKey) };
  return authHeaders(apiKey);
}

function chatHeaders(kind, apiKey) {
  if (kind === 'ollama') return { 'content-type': 'application/json' };
  if (kind === 'anthropic-messages') return { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', ...(apiKey ? { 'x-api-key': apiKey } : {}) };
  if (kind === 'gemini-native') return { 'content-type': 'application/json', ...(apiKey ? { 'x-goog-api-key': apiKey } : {}) };
  if (kind === 'azure-openai') return { 'content-type': 'application/json', ...(apiKey ? { 'api-key': apiKey } : {}) };
  if (kind === 'dashscope-native') return { 'content-type': 'application/json', 'x-dashscope-sse': 'enable', ...authHeaders(apiKey) };
  return { 'content-type': 'application/json', ...authHeaders(apiKey) };
}

function chatEndpoint(provider, kind, modelId) {
  if (kind === 'ollama') return providerEndpoint(provider, '/api/chat');
  if (kind === 'openai-responses') return providerEndpoint(provider, '/responses');
  if (kind === 'anthropic-messages') return providerEndpoint(provider, '/messages');
  if (kind === 'gemini-native') return providerEndpoint(provider, `/models/${normalizeGeminiModelId(modelId)}:streamGenerateContent?alt=sse`);
  if (kind === 'azure-openai') return azureEndpoint(provider, `/openai/deployments/${encodeURIComponent(modelId)}/chat/completions`);
  if (kind === 'dashscope-native') return providerEndpoint(provider, '/services/aigc/text-generation/generation');
  return providerEndpoint(provider, '/chat/completions');
}

function imageGenerationEndpoint(provider, kind, modelId) {
  if (kind === 'azure-openai') return azureEndpoint(provider, `/openai/deployments/${encodeURIComponent(modelId)}/images/generations`);
  return providerEndpoint(provider, '/images/generations');
}

function chatBody(kind, modelId, messages) {
  if (kind === 'openai-responses') return { model: modelId, input: messages, stream: true };
  if (kind === 'anthropic-messages') {
    const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
    return {
      model: modelId,
      max_tokens: 4096,
      system: system || undefined,
      messages: messages.filter((message) => message.role === 'user' || message.role === 'assistant'),
      stream: true,
    };
  }
  if (kind === 'gemini-native') {
    const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
    return {
      contents: messages
        .filter((message) => message.role === 'user' || message.role === 'assistant')
        .map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    };
  }
  if (kind === 'dashscope-native') {
    return { model: modelId, input: { messages }, parameters: { incremental_output: true } };
  }
  return { model: modelId, messages, stream: true };
}

function imageGenerationBody(kind, modelId, prompt, size) {
  if (kind === 'azure-openai') {
    return { prompt, size, n: 1 };
  }
  return {
    model: modelId,
    prompt,
    size,
    n: 1,
  };
}

function modelIdsFromValidationBody(kind, body) {
  if (kind === 'ollama') return (body.models ?? []).map((model) => model.name);
  if (kind === 'gemini-native') return (body.models ?? []).map((model) => normalizeGeminiModelId(model.name));
  return (body.data ?? body.models ?? []).map((model) => model.id ?? model.name).filter(Boolean);
}

function parseProviderBrowserStream(kind, stream) {
  if (kind === 'ollama') return parseOllamaBrowserStream(stream);
  if (kind === 'openai-responses') return parseOpenAIResponsesBrowserStream(stream);
  if (kind === 'anthropic-messages') return parseAnthropicBrowserStream(stream);
  if (kind === 'gemini-native') return parseGeminiBrowserStream(stream);
  if (kind === 'dashscope-native') return parseDashScopeBrowserStream(stream);
  return parseOpenAIBrowserStream(stream);
}

function supportsImageGeneration(kind) {
  return ['openai-compatible', 'openai-responses', 'azure-openai'].includes(kind);
}

function parseImageGenerationBody(body) {
  const images = (body.data ?? body.images ?? [])
    .map((item) => {
      const b64 = item.b64_json ?? item.b64Json ?? item.image?.b64_json;
      const url = item.url ?? item.image_url;
      const mimeType = item.mime_type ?? item.mimeType ?? 'image/png';
      if (b64) {
        return {
          type: 'data-url',
          dataUrl: `data:${mimeType};base64,${b64}`,
          mimeType,
          revisedPrompt: item.revised_prompt ?? item.revisedPrompt,
        };
      }
      if (url) {
        return {
          type: 'url',
          url,
          mimeType,
          revisedPrompt: item.revised_prompt ?? item.revisedPrompt,
        };
      }
      return undefined;
    })
    .filter(Boolean);
  if (images.length === 0) {
    throw new Error('Image provider returned no usable image data.');
  }
  return {
    images,
    usage: normalizeUsage(body.usage),
  };
}

async function* parseBrowserSse(stream) {
  if (!stream) return;
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
        const parsed = parseBrowserSseEvent(event);
        if (parsed) yield parsed;
      }
      if (done) {
        const parsed = parseBrowserSseEvent(buffer);
        if (parsed) yield parsed;
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseBrowserSseEvent(event) {
  const eventName = event.split(/\r?\n/).find((line) => line.startsWith('event:'))?.slice(6).trim();
  const data = event.split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n')
    .trim();
  return data ? { event: eventName, data } : undefined;
}

function normalizeGeminiModelId(modelId) {
  return String(modelId).startsWith('models/') ? String(modelId).slice('models/'.length) : String(modelId);
}

function azureEndpoint(provider, path) {
  const raw = provider.baseUrl || defaultBaseUrl('azure-openai');
  if (!raw) return providerEndpoint(provider, path);
  const url = new URL(raw);
  const apiVersion = url.searchParams.get('api-version') || '2025-04-01-preview';
  url.search = '';
  url.hash = '';
  return `${url.toString().replace(/\/$/, '')}${path}?api-version=${encodeURIComponent(apiVersion)}`;
}

function openAIChatUsageFromEvent(parsed) {
  return normalizeUsage(parsed.usage);
}

function openAIResponsesUsageFromEvent(parsed) {
  return normalizeUsage(parsed.usage ?? parsed.response?.usage);
}

function anthropicUsageFromEvent(parsed) {
  const input = numericUsageValue(parsed.message?.usage?.input_tokens);
  const output = numericUsageValue(parsed.usage?.output_tokens ?? parsed.delta?.usage?.output_tokens);
  return input || output ? usageFromParts(input, output) : undefined;
}

function geminiUsageFromEvent(parsed) {
  const usage = parsed.usageMetadata;
  return usage
    ? usageFromParts(usage.promptTokenCount, usage.candidatesTokenCount, usage.totalTokenCount)
    : undefined;
}

function dashScopeUsageFromEvent(parsed) {
  const usage = parsed.usage;
  return usage
    ? usageFromParts(usage.input_tokens, usage.output_tokens, usage.total_tokens)
    : undefined;
}

function normalizeUsage(usage) {
  if (!usage) return undefined;
  return usageFromParts(
    usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? usage.inputTokens,
    usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? usage.outputTokens,
    usage.total_tokens ?? usage.totalTokens,
  );
}

function usageFromParts(prompt, completion, total) {
  const promptTokens = numericUsageValue(prompt);
  const completionTokens = numericUsageValue(completion);
  const totalTokens = numericUsageValue(total) || promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

function numericUsageValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function mergeUsage(current, next) {
  if (!current) return next;
  if (!next) return current;
  const promptTokens = next.promptTokens || current.promptTokens;
  const completionTokens = next.completionTokens || current.completionTokens;
  return {
    promptTokens,
    completionTokens,
    totalTokens: next.totalTokens || promptTokens + completionTokens,
  };
}

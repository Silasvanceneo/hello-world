import {
  addAttachmentToActiveSession,
  addMessageToActiveSession,
  createProviderFromForm,
  estimateImageTokenUsage,
} from './web-state.js';

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function createProviderDraftFromInputs(elements, id, timestamp = new Date().toISOString()) {
  const provider = createProviderFromForm({
    name: elements.providerName.value,
    type: elements.providerType.value,
    baseUrl: elements.providerBaseUrl.value,
    modelId: elements.providerModel.value,
    apiKey: elements.providerApiKey.value,
  }, timestamp, id);
  return {
    ...provider,
    imageModelId: elements.providerImageModel.value.trim() || undefined,
  };
}

export function rememberProviderSecret(providerSecrets, apiKey, provider) {
  if (apiKey) {
    providerSecrets.set(provider.id, apiKey);
  }
}

export function renderProviderModelOptions(elements, models) {
  elements.providerModelOptions.innerHTML = models
    .slice(0, 200)
    .map((model) => `<option value="${escapeHtml(model)}"></option>`)
    .join('');
}

export function appendPromptText(promptTarget, text) {
  const current = promptTarget.value.trim();
  promptTarget.value = current ? `${current}\n${text}` : text;
  promptTarget.focus();
}

export function addBrowserFilesToState(currentState, files, {
  idFactory = () => crypto.randomUUID(),
  now = () => new Date().toISOString(),
} = {}) {
  return files.reduce((nextState, file) => addAttachmentToActiveSession(nextState, {
    id: idFactory(),
    kind: detectBrowserFileKind(file),
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    createdAt: now(),
  }), currentState);
}

export function addGeneratedImageResultToActiveSession(currentState, {
  prompt,
  providerId,
  modelId,
  result,
  t,
  idFactory = () => crypto.randomUUID(),
  timestamp = new Date().toISOString(),
}) {
  const imageContents = [];
  let nextState = currentState;
  for (const [index, image] of result.images.entries()) {
    const attachment = createGeneratedImageAttachment(image, {
      index,
      timestamp,
      id: idFactory(),
    });
    nextState = addAttachmentToActiveSession(nextState, attachment);
    imageContents.push({ type: 'image', fileId: attachment.id, mimeType: attachment.mimeType });
  }
  return addMessageToActiveSession(nextState, {
    id: idFactory(),
    role: 'assistant',
    content: [
      { type: 'text', text: generatedImageMessageText(prompt, result, t) },
      ...imageContents,
    ],
    providerId,
    modelId,
    usage: result.usage ?? estimateImageTokenUsage(prompt, result.images.length),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function createGeneratedImageAttachment(image, { index, timestamp, id }) {
  return {
    id,
    kind: 'image',
    name: `generated-image-${index + 1}.png`,
    mimeType: image.mimeType ?? 'image/png',
    sizeBytes: image.dataUrl ? Math.round((image.dataUrl.length * 3) / 4) : 0,
    dataUrl: image.dataUrl,
    url: image.url,
    createdAt: timestamp,
  };
}

export function generatedImageMessageText(prompt, result, t) {
  const translate = t ?? ((key, values) => `${key}: ${values?.prompt ?? ''}`);
  const revisedPrompt = result.images.find((image) => image.revisedPrompt)?.revisedPrompt;
  return revisedPrompt
    ? `${translate('image.generatedFor', { prompt })}\n${translate('image.revisedPrompt', { prompt: revisedPrompt })}`
    : translate('image.generatedFor', { prompt });
}

export function findLastAssistantText(session) {
  return [...(session?.messages ?? [])]
    .reverse()
    .find((message) => message.role === 'assistant')
    ?.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n')
    .trim() ?? '';
}

export function inferRoutingTask(session) {
  const attachments = session?.attachments ?? [];
  if (attachments.some((attachment) => attachment.kind === 'image')) return 'vision';
  if (attachments.length > 0) return 'files';
  return 'text';
}

export function detectBrowserFileKind(file) {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/')) return 'image';
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.xlsx')) return 'xlsx';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown';
  return 'text';
}

export function syncTargetCsv(settings = {}) {
  return [
    settings.includeChats !== false ? 'chats' : undefined,
    settings.includeSettings !== false ? 'settings' : undefined,
    settings.includeProviders !== false ? 'providers' : undefined,
    settings.includePrompts !== false ? 'prompts' : undefined,
    settings.includeAgents !== false ? 'agents' : undefined,
    settings.includeKnowledgeMetadata !== false ? 'knowledge-metadata' : undefined,
  ].filter(Boolean).join(', ');
}

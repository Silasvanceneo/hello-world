import type { AIModel, ModelCapability, ProviderType } from '@hello-world/shared';
import { textOnlyModelCapability } from '@hello-world/shared';

export type ModelTask = 'text' | 'vision' | 'files' | 'tools' | 'reasoning' | 'image-generation';

export type UiCapabilityAvailability = {
  imageInput: CapabilityGate;
  fileInput: CapabilityGate;
  toolUse: CapabilityGate;
  reasoningControls: CapabilityGate;
  imageGeneration: CapabilityGate;
};

export type CapabilityGate = {
  enabled: boolean;
  reason?: string;
};

export function inferModelCapability(model: Pick<AIModel, 'id' | 'displayName'> | string, providerType?: ProviderType): ModelCapability {
  const name = normalizeModelName(typeof model === 'string' ? model : `${model.id} ${model.displayName}`);
  const capability: ModelCapability = { ...textOnlyModelCapability };

  if (providerType === 'ollama') {
    capability.supportsTools = includesAny(name, ['llama3.1', 'llama3.2', 'qwen2.5', 'mistral-nemo']);
  }

  if (includesAny(name, ['gpt-4o', 'gpt-4.1', 'gpt-5', 'claude-3', 'claude-4', 'gemini', 'qwen-vl', 'llava', 'pixtral', 'vision'])) {
    capability.supportsVision = true;
  }

  if (includesAny(name, ['gpt-4.1', 'gpt-4o', 'claude-3', 'claude-4', 'gemini', 'qwen-long', 'long-context'])) {
    capability.supportsFiles = true;
  }

  if (includesAny(name, ['gpt-4', 'gpt-5', 'claude', 'gemini', 'qwen', 'llama3.1', 'llama3.2', 'mistral'])) {
    capability.supportsTools = true;
  }

  if (includesAny(name, ['o1', 'o3', 'o4', 'reasoning', 'deepseek-r1', 'deepseek-reasoner', 'gemini-2.5', 'claude-3.7', 'claude-4'])) {
    capability.supportsReasoning = true;
  }

  if (includesAny(name, ['dall-e', 'gpt-image', 'imagen', 'flux', 'sdxl', 'stable-diffusion'])) {
    capability.supportsImageGeneration = true;
    capability.supportsText = false;
  }

  if (includesAny(name, ['tts', 'audio', 'realtime', 'whisper'])) {
    capability.supportsAudioInput = true;
    capability.supportsAudioOutput = true;
  }

  capability.contextWindow = inferContextWindow(name);
  return capability;
}

export function mergeModelCapability(base: ModelCapability, override: Partial<ModelCapability>): ModelCapability {
  return { ...base, ...override };
}

export function getUiCapabilityAvailability(capability: ModelCapability): UiCapabilityAvailability {
  return {
    imageInput: capability.supportsVision ? enabled() : disabled('Choose a vision-capable model to send images.'),
    fileInput: capability.supportsFiles ? enabled() : disabled('Choose a file-capable model or paste extracted text as context.'),
    toolUse: capability.supportsTools ? enabled() : disabled('This model does not advertise tool-use support.'),
    reasoningControls: capability.supportsReasoning ? enabled() : disabled('Reasoning controls are hidden for this model.'),
    imageGeneration: capability.supportsImageGeneration ? enabled() : disabled('Choose an image-generation model.'),
  };
}

export function chooseModelsForTask(models: AIModel[], task: ModelTask): AIModel[] {
  return models
    .filter((model) => supportsTask(model.capability, task))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function supportsTask(capability: ModelCapability, task: ModelTask): boolean {
  if (task === 'text') return capability.supportsText;
  if (task === 'vision') return capability.supportsVision;
  if (task === 'files') return capability.supportsFiles;
  if (task === 'tools') return capability.supportsTools;
  if (task === 'reasoning') return capability.supportsReasoning;
  return capability.supportsImageGeneration;
}

function inferContextWindow(name: string): number | undefined {
  if (includesAny(name, ['1m', '1000k'])) return 1_000_000;
  if (includesAny(name, ['200k', 'claude-3', 'claude-4'])) return 200_000;
  if (includesAny(name, ['128k', 'gpt-4.1', 'gpt-4o', 'qwen'])) return 128_000;
  if (includesAny(name, ['32k'])) return 32_000;
  return undefined;
}

function normalizeModelName(name: string): string {
  return name.toLowerCase().replaceAll('_', '-');
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function enabled(): CapabilityGate {
  return { enabled: true };
}

function disabled(reason: string): CapabilityGate {
  return { enabled: false, reason };
}

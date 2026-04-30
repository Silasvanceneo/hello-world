import type { AIModel, ModelCapability, ProviderType } from '@hello-world/shared';
import type { ModelTask } from './model-capability.ts';

export type ModelRoutingStrategy = 'balanced' | 'cheap' | 'fast' | 'long-context' | 'privacy' | 'fallback';

export type ModelRouteCandidate = {
  providerId: string;
  providerName: string;
  providerType: ProviderType;
  modelId: string;
  displayName: string;
  capability: ModelCapability;
  status: AIModel['status'];
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  averageLatencyMs?: number;
  isLocal?: boolean;
};

export type ModelRoutingRequest = {
  strategy: ModelRoutingStrategy;
  task: ModelTask;
  failedProviderIds?: string[];
  failedModelIds?: string[];
};

export type RankedModelRoute = ModelRouteCandidate & {
  score: number;
  reasons: string[];
};

export function chooseModelRoute(
  candidates: ModelRouteCandidate[],
  request: ModelRoutingRequest,
): RankedModelRoute | undefined {
  return rankModelRoutes(candidates, request)[0];
}

export function rankModelRoutes(
  candidates: ModelRouteCandidate[],
  request: ModelRoutingRequest,
): RankedModelRoute[] {
  return candidates
    .filter((candidate) => candidate.status !== 'unavailable' && supportsTask(candidate.capability, request.task))
    .map((candidate) => scoreCandidate(candidate, request))
    .sort((left, right) => right.score - left.score || left.displayName.localeCompare(right.displayName));
}

function scoreCandidate(candidate: ModelRouteCandidate, request: ModelRoutingRequest): RankedModelRoute {
  const reasons: string[] = [];
  let score = 100;
  if (request.strategy === 'cheap') score += cheapScore(candidate, reasons);
  if (request.strategy === 'fast') score += fastScore(candidate, reasons);
  if (request.strategy === 'long-context') score += longContextScore(candidate, reasons);
  if (request.strategy === 'privacy') score += privacyScore(candidate, reasons);
  if (request.strategy === 'fallback') score += fallbackScore(candidate, request, reasons);
  if (request.strategy === 'balanced') reasons.push('balanced default order');
  return { ...candidate, score, reasons };
}

function cheapScore(candidate: ModelRouteCandidate, reasons: string[]): number {
  const price = (candidate.inputPricePerMillion ?? heuristicInputPrice(candidate.modelId))
    + (candidate.outputPricePerMillion ?? heuristicOutputPrice(candidate.modelId));
  reasons.push(`estimated price ${price.toFixed(2)} per million tokens`);
  return Math.max(0, 1000 - price * 50);
}

function fastScore(candidate: ModelRouteCandidate, reasons: string[]): number {
  const latency = candidate.averageLatencyMs ?? heuristicLatency(candidate.modelId, candidate.providerType);
  reasons.push(`estimated latency ${latency} ms`);
  return Math.max(0, 1000 - latency);
}

function longContextScore(candidate: ModelRouteCandidate, reasons: string[]): number {
  const contextWindow = candidate.capability.contextWindow ?? 8_000;
  reasons.push(`context window ${contextWindow}`);
  return Math.log2(contextWindow) * 60;
}

function privacyScore(candidate: ModelRouteCandidate, reasons: string[]): number {
  if (candidate.isLocal || candidate.providerType === 'ollama') {
    reasons.push('local/private provider');
    return 1000;
  }
  reasons.push('remote provider');
  return 0;
}

function fallbackScore(candidate: ModelRouteCandidate, request: ModelRoutingRequest, reasons: string[]): number {
  const failed = request.failedProviderIds?.includes(candidate.providerId) || request.failedModelIds?.includes(candidate.modelId);
  reasons.push(failed ? 'previously failed route' : 'available fallback route');
  return failed ? -1000 : 500;
}

function supportsTask(capability: ModelCapability, task: ModelTask): boolean {
  if (task === 'text') return capability.supportsText;
  if (task === 'vision') return capability.supportsVision;
  if (task === 'files') return capability.supportsFiles;
  if (task === 'tools') return capability.supportsTools;
  if (task === 'reasoning') return capability.supportsReasoning;
  return capability.supportsImageGeneration;
}

function heuristicInputPrice(modelId: string): number {
  const name = modelId.toLowerCase();
  if (name.includes('mini') || name.includes('small')) return 0.2;
  if (name.includes('ollama') || name.includes('llama')) return 0;
  if (name.includes('gpt-4.1') || name.includes('claude')) return 3;
  return 1;
}

function heuristicOutputPrice(modelId: string): number {
  const name = modelId.toLowerCase();
  if (name.includes('mini') || name.includes('small')) return 0.8;
  if (name.includes('ollama') || name.includes('llama')) return 0;
  if (name.includes('gpt-4.1') || name.includes('claude')) return 12;
  return 3;
}

function heuristicLatency(modelId: string, providerType: ProviderType): number {
  const name = modelId.toLowerCase();
  if (name.includes('mini') || name.includes('small')) return 180;
  if (providerType === 'ollama') return 650;
  if (name.includes('reasoning')) return 1200;
  return 450;
}

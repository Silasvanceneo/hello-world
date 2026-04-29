export function capabilityBadges(capability) {
  return [
    capability.supportsVision ? 'Vision' : undefined,
    capability.supportsFiles ? 'Files' : undefined,
    capability.supportsTools ? 'Tools' : undefined,
    capability.supportsReasoning ? 'Reasoning' : undefined,
    capability.supportsImageGeneration ? 'Image generation' : undefined,
  ].filter(Boolean);
}

export function inputHints(capability) {
  return {
    canAttachImage: Boolean(capability.supportsVision),
    canAttachFile: Boolean(capability.supportsFiles),
    canUseTools: Boolean(capability.supportsTools),
    canTuneReasoning: Boolean(capability.supportsReasoning),
  };
}
